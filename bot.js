const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const toolPlugin = require('mineflayer-tool').plugin
const pvp = require('mineflayer-pvp').plugin
const { Vec3 } = require('vec3')
const express = require('express')
const { WebSocketServer } = require('ws')
const net = require('net')
const fs = require('fs')
const path = require('path')

// ===== SINGLE-INSTANCE LOCK =====
const LOCK_FILE = path.join(__dirname, 'bot.lock')
if (fs.existsSync(LOCK_FILE)) {
    const oldPid = fs.readFileSync(LOCK_FILE, 'utf8').trim()
    console.log(`⚠️  Another bot instance may be running (PID ${oldPid}).`)
    try {
        process.kill(Number(oldPid), 0)
        console.error('❌ Bot already running! Exiting.')
        process.exit(1)
    } catch (e) {
        console.log('🔓 Stale lock found, taking over.')
    }
}
fs.writeFileSync(LOCK_FILE, String(process.pid))
const cleanupLock = () => { try { fs.unlinkSync(LOCK_FILE) } catch (e) { } }
process.on('exit', cleanupLock)
process.on('SIGINT', () => { cleanupLock(); process.exit() })
process.on('SIGTERM', () => { cleanupLock(); process.exit() })
process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)

// ===== CONFIG =====
const HOST = 'muth.aternos.me'
const PORT = 37604
const USERNAME = 'SomuUltraAI'
const VERSION = '1.21.11'
const MASTER_PLAYER = 'Somu'  // ← player who can issue chat commands

// ===== DASHBOARD STATE =====
const dashState = {
    status: 'offline',
    currentUsername: USERNAME,
    position: { x: 0, y: 0, z: 0 },
    health: 20, food: 20, xp: 0,
    tasks: {
        roam: true, mining: true, farming: true,
        combat: true, autoEat: true, autoArmor: true,
        autoCraft: true, fishing: false, follow: false
    },
    followTarget: null,
    inventory: [],
    chatLog: [],
    stats: { mobsKilled: 0, blocksMined: 0, itemsCrafted: 0, fishCaught: 0 }
}

// ===== WEBSOCKET BROADCAST =====
const clients = new Set()
function broadcast(type, data) {
    let msg
    try { msg = JSON.stringify({ type, data }) } catch (e) { return }
    for (const c of clients) {
        try { if (c.readyState === 1) c.send(msg) } catch (e) {}
    }
}
function syncDash() {
    // Strip chatLog from state broadcast — chat is pushed individually via 'chat' events
    // This keeps the state payload small and avoids any stringify issues with large logs
    const { chatLog, ...stateToSend } = dashState
    broadcast('state', stateToSend)
}

// ===== EXPRESS + WS SERVER =====
const app = express()
app.use(express.json())
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')))

// Dashboard API — toggle tasks
app.post('/task', (req, res) => {
    const { task, value } = req.body
    if (task in dashState.tasks) {
        dashState.tasks[task] = value
        syncDash()
        res.json({ ok: true })
    } else {
        res.status(400).json({ error: 'unknown task' })
    }
})

// Dashboard API — set follow target
app.post('/follow', (req, res) => {
    dashState.followTarget = req.body.player || null
    dashState.tasks.follow = !!dashState.followTarget
    syncDash()
    res.json({ ok: true })
})

// Dashboard API — send chat message as bot
app.post('/chat', (req, res) => {
    const { message } = req.body
    if (!message) return res.status(400).json({ error: 'no message' })
    if (activeBot) {
        try { activeBot.chat(String(message).slice(0, 256)) } catch (e) {}
    }
    res.json({ ok: true })
})

const server = app.listen(3000, () => console.log('🌐 Dashboard server on :3000'))

// Heartbeat — push full state every 5s regardless of events
// Ensures dashboard never shows stale data even if an event was missed
setInterval(syncDash, 5000)

const wss = new WebSocketServer({ server })
wss.on('connection', ws => {
    clients.add(ws)
    ws.send(JSON.stringify({ type: 'state', data: dashState }))
    ws.on('close', () => clients.delete(ws))
    ws.on('message', raw => {
        try {
            const msg = JSON.parse(raw)
            if (msg.type === 'ping') {
                // Dashboard requesting fresh state — send it immediately
                try { ws.send(JSON.stringify({ type: 'state', data: dashState })) } catch (e) {}
            } else if (msg.type === 'task') {
                if (msg.task in dashState.tasks) {
                    dashState.tasks[msg.task] = msg.value
                    syncDash()
                }
            } else if (msg.type === 'follow') {
                dashState.followTarget = msg.player || null
                dashState.tasks.follow = !!dashState.followTarget
                syncDash()
            }
        } catch (e) { }
    })
})

// ===== RECONNECT STATE =====
// Tracks how long we've been failing to join so we can trigger username rotation
const reconnectState = {
    failingSince: null,       // timestamp of first failed attempt in current streak
    currentUsername: USERNAME,
    usernameIndex: 0,
    attemptCount: 0
}

// Alternate usernames tried after 30 min of failed joins
const USERNAME_POOL = [
    USERNAME,
    USERNAME + '_',
    USERNAME + '2',
    'UltraBot_' + Math.floor(Math.random() * 9999),
]

function logReconnect(msg) {
    console.log(msg)
    broadcast('reconnect_log', { time: Date.now(), msg })
}

// ===== SERVER PING =====
function pingServer(cb) {
    const s = new net.Socket()
    s.setTimeout(5000)
    s.on('connect', () => { s.destroy(); cb(true) })
    s.on('error', () => { s.destroy(); cb(false) })
    s.on('timeout', () => { s.destroy(); cb(false) })
    s.connect(PORT, HOST)
}

// ===== SMART RECONNECT ENTRY POINT =====
// delay: ms to wait before this attempt (jitter already applied by caller)
function startBot(delay = 0) {
    dashState.status = 'reconnecting'
    syncDash()

    setTimeout(() => {
        reconnectState.attemptCount++
        logReconnect(`🔄 Connect attempt #${reconnectState.attemptCount} (username: ${reconnectState.currentUsername})`)

        pingServer(online => {
            if (!online) {
                // Server is completely unreachable — keep polling every 30s
                logReconnect('❌ Server unreachable — retrying in 30s')
                dashState.status = 'server_offline'
                syncDash()
                return startBot(30000)
            }

            // Server is up — track how long we've been failing to actually join
            if (!reconnectState.failingSince) {
                reconnectState.failingSince = Date.now()
            }

            const failingFor = Date.now() - reconnectState.failingSince
            const THIRTY_MIN = 30 * 60 * 1000

            if (failingFor >= THIRTY_MIN) {
                // Server is online but we still can't join after 30 min →
                // try a different username (ban/session conflict)
                reconnectState.usernameIndex = (reconnectState.usernameIndex + 1) % USERNAME_POOL.length
                reconnectState.currentUsername = USERNAME_POOL[reconnectState.usernameIndex]
                logReconnect(`⚠️  30 min join failure — switching username to: ${reconnectState.currentUsername}`)
                dashState.status = 'username_switch'
                syncDash()
                // Reset the timer so we get another 30 min window with the new name
                reconnectState.failingSince = Date.now()
            }

            createBot(reconnectState.currentUsername)
        })
    }, delay)
}

// Holds reference to current live bot so REST endpoints can reach it
let activeBot = null

// ===== BOT CREATION =====
function createBot(username) {
    let reconnecting = false
    activeBot = null
    dashState.status = 'connecting'
    dashState.currentUsername = username
    syncDash()

    logReconnect(`🤖 Creating bot as: ${username}`)

    const bot = mineflayer.createBot({
        host: HOST, port: PORT,
        username: username, version: VERSION,
        keepAlive: true
    })

    bot.loadPlugin(pathfinder)
    bot.loadPlugin(collectBlock)
    bot.loadPlugin(toolPlugin)
    bot.loadPlugin(pvp)

    bot.once('spawn', () => {
        console.log('✅ Joined server as', username)
        activeBot = bot
        // Successful join — reset all failure tracking
        reconnectState.failingSince = null
        reconnectState.attemptCount = 0
        dashState.status = 'online'
        dashState.health = bot.health
        dashState.food = bot.food
        syncDash()

        const move = new Movements(bot)
        bot.pathfinder.setMovements(move)

        setTimeout(() => bot.chat('/login 123456'), 20000)
        setTimeout(() => startBrain(bot), 45000)
    })

    // Sync bot stats to dashboard
    bot.on('health', () => {
        dashState.health = bot.health
        dashState.food = bot.food
        syncDash()
    })

    bot.on('experience', () => {
        dashState.xp = bot.experience.level
        syncDash()
    })

    // Throttle position updates — physicsTick fires 20x/sec, we only need ~1x/2s
    let lastPosTick = 0
    bot.on('physicsTick', () => {
        if (!bot.entity) return
        const now = Date.now()
        if (now - lastPosTick < 2000) return
        lastPosTick = now
        const p = bot.entity.position
        dashState.position = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) }
        syncDash()
    })

    // ===== CHAT COMMAND SYSTEM =====
    bot.on('chat', (username, message) => {
        // Log all chat and push to dashboard in real time
        const entry = { time: Date.now(), username, message }
        dashState.chatLog.unshift(entry)
        if (dashState.chatLog.length > 50) dashState.chatLog.pop()
        broadcast('chat', entry)  // individual real-time push

        // Only master player can issue commands
        if (username !== MASTER_PLAYER) return

        const args = message.trim().split(/\s+/)
        const cmd = args[0].toLowerCase()

        switch (cmd) {
            case '!follow':
                dashState.followTarget = args[1] || username
                dashState.tasks.follow = true
                bot.chat(`👣 Following ${dashState.followTarget}`)
                syncDash()
                break
            case '!unfollow':
                dashState.followTarget = null
                dashState.tasks.follow = false
                bot.pathfinder.setGoal(null)
                bot.chat('✋ Stopped following')
                syncDash()
                break
            case '!come':
                const p = bot.players[username]?.entity?.position
                if (p) bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 2))
                bot.chat('🏃 On my way!')
                break
            case '!stop':
                bot.pathfinder.setGoal(null)
                bot.pvp.stop()
                bot.chat('🛑 Stopped all movement')
                break
            case '!mine':
                dashState.tasks.mining = !dashState.tasks.mining
                bot.chat(`⛏️ Mining ${dashState.tasks.mining ? 'ON' : 'OFF'}`)
                syncDash()
                break
            case '!farm':
                dashState.tasks.farming = !dashState.tasks.farming
                bot.chat(`🌾 Farming ${dashState.tasks.farming ? 'ON' : 'OFF'}`)
                syncDash()
                break
            case '!fish':
                dashState.tasks.fishing = !dashState.tasks.fishing
                bot.chat(`🎣 Fishing ${dashState.tasks.fishing ? 'ON' : 'OFF'}`)
                syncDash()
                break
            case '!combat':
                dashState.tasks.combat = !dashState.tasks.combat
                bot.chat(`⚔️ Combat ${dashState.tasks.combat ? 'ON' : 'OFF'}`)
                syncDash()
                break
            case '!inv':
                const items = bot.inventory.items().slice(0, 6).map(i => `${i.name}x${i.count}`).join(', ')
                bot.chat(`🎒 ${items || 'Empty'}`)
                break
            case '!craft':
                bot.chat('🔨 Crafting best available tools...')
                runCrafting(bot)
                break
            case '!pos':
                const pos = bot.entity.position
                bot.chat(`📍 ${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}`)
                break
            case '!help':
                bot.chat('Commands: !follow [player] !unfollow !come !stop !mine !farm !fish !combat !inv !craft !pos !help')
                break
        }
    })

    bot.on('kicked', r => {
        console.log('Kicked', r)
        activeBot = null
        dashState.status = 'kicked'
        syncDash()
        const reason = JSON.stringify(r)
        if (reason.includes('duplicate_login')) {
            logReconnect('⚠️ Duplicate login — waiting 3 min for old session to expire...')
            if (!reconnecting) { reconnecting = true; startBot(180000) }
        } else {
            reconnect()
        }
    })

    bot.on('end', () => {
        logReconnect('📴 Disconnected — reconnecting in 15–30s')
        activeBot = null
        dashState.status = 'offline'
        dashState.health = 0
        dashState.food = 0
        dashState.inventory = []
        syncDash()
        reconnect()
    })

    function reconnect() {
        if (reconnecting) return
        reconnecting = true
        // Jitter: 15–30s so rapid kick loops don't hammer the server
        const delay = 15000 + Math.random() * 15000
        startBot(delay)
    }

    return bot
}

// ===== BRAIN =====
function startBrain(bot) {
    console.log('🧠 ULTRA BRAIN ACTIVE')

    // ===== ROAM =====
    setInterval(() => {
        if (!dashState.tasks.roam) return
        if (dashState.tasks.follow && dashState.followTarget) return
        const x = bot.entity.position.x + (Math.random() * 120 - 60)
        const z = bot.entity.position.z + (Math.random() * 120 - 60)
        bot.pathfinder.setGoal(new GoalNear(x, bot.entity.position.y, z, 1))
    }, 90000)

    // ===== FOLLOW & PROTECT =====
    setInterval(() => {
        if (!dashState.tasks.follow || !dashState.followTarget) return
        const target = bot.players[dashState.followTarget]?.entity
        if (!target) return
        bot.pathfinder.setGoal(new GoalFollow(target, 3), true)

        // Protect: attack anything attacking the followed player
        const nearby = Object.values(bot.entities).find(e =>
            e.type === 'mob' &&
            e.position.distanceTo(target.position) < 6
        )
        if (nearby) bot.pvp.attack(nearby)
    }, 2000)

    // ===== INVENTORY CLEANUP =====
    setInterval(() => {
        const trash = ['dirt', 'cobblestone', 'gravel', 'sand']
        trash.forEach(name => {
            const item = bot.inventory.items().find(i => i.name.includes(name))
            if (item && item.count > 128) bot.tossStack(item)
        })
        // Sync inventory to dashboard
        dashState.inventory = bot.inventory.items().map(i => ({
            name: i.name, count: i.count, slot: i.slot
        }))
        syncDash()
    }, 60000)

    // ===== TREE CUT =====
    setInterval(() => {
        if (!dashState.tasks.mining) return
        const tree = bot.findBlock({ matching: b => b?.name.includes('log'), maxDistance: 6 })
        if (!tree) return
        bot.tool.equipForBlock(tree).then(() => {
            return bot.dig(tree)
        }).then(() => {
            dashState.stats.blocksMined++
            syncDash()
        }).catch(() => { })
    }, 50000)

    // ===== FARMING =====
    setInterval(() => {
        if (!dashState.tasks.farming) return
        const crop = bot.findBlock({ matching: b => b?.name === 'wheat' && b.metadata === 7, maxDistance: 5 })
        if (crop) { bot.dig(crop).catch(() => { }); return }

        const farmland = bot.findBlock({ matching: b => b?.name === 'farmland', maxDistance: 5 })
        const aboveFarmland = farmland && bot.blockAt(farmland.position.offset(0, 1, 0))
        if (aboveFarmland?.name === 'air') {
            const seed = bot.inventory.items().find(i => i.name.includes('wheat_seeds'))
            if (farmland && seed) {
                bot.equip(seed, 'hand').then(() =>
                    bot.placeBlock(farmland, new Vec3(0, 1, 0))
                ).catch(() => { })
            }
        }
    }, 40000)

    // ===== FISHING =====
    let fishingRod = null
    setInterval(async () => {
        if (!dashState.tasks.fishing) {
            if (fishingRod) { bot.activateItem(); fishingRod = null }
            return
        }
        const rod = bot.inventory.items().find(i => i.name === 'fishing_rod')
        if (!rod) return
        try {
            await bot.equip(rod, 'hand')
            bot.activateItem()
            fishingRod = rod
        } catch (e) { }
    }, 30000)

    bot.on('playerCollect', (collector, item) => {
        if (collector?.username === username) {
            // Always sync inventory after any pickup
            dashState.inventory = bot.inventory.items().map(i => ({ name: i.name, count: i.count, slot: i.slot }))
            if (dashState.tasks.fishing &&
                (item?.name?.includes('fish') || item?.name?.includes('cod') || item?.name?.includes('salmon'))) {
                dashState.stats.fishCaught++
            }
            syncDash()
        }
    })

    // ===== MOB FIGHT =====
    setInterval(() => {
        if (!dashState.tasks.combat) return
        const mob = bot.nearestEntity(e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 10)
        if (mob) {
            bot.pvp.attack(mob)
            dashState.stats.mobsKilled++
            syncDash()
        }
    }, 15000)

    // ===== AUTO EAT =====
    setInterval(() => {
        if (!dashState.tasks.autoEat) return
        if (bot.food >= 18) return
        const foodItems = ['cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'bread', 'golden_apple']
        const food = bot.inventory.items().find(i => foodItems.some(f => i.name.includes(f)))
        if (food) {
            bot.equip(food, 'hand').then(() => bot.consume()).catch(() => { })
        }
    }, 20000)

    // ===== AUTO ARMOR =====
    const ARMOR_SLOTS = {
        head: { slot: 5, names: ['helmet'] },
        chest: { slot: 6, names: ['chestplate'] },
        legs: { slot: 7, names: ['leggings'] },
        feet: { slot: 8, names: ['boots'] },
    }
    const TIERS = ['netherite', 'diamond', 'iron', 'golden', 'chainmail', 'leather']
    setInterval(() => {
        if (!dashState.tasks.autoArmor) return
        for (const [slot, { slot: slotIdx, names }] of Object.entries(ARMOR_SLOTS)) {
            const equipped = bot.inventory.slots[slotIdx]
            const best = bot.inventory.items()
                .filter(i => names.some(n => i.name.includes(n)))
                .sort((a, b) =>
                    TIERS.findIndex(t => a.name.includes(t)) - TIERS.findIndex(t => b.name.includes(t))
                )[0]
            if (!best) continue
            const equippedTier = equipped ? TIERS.findIndex(t => (equipped.name || '').includes(t)) : 999
            const bestTier = TIERS.findIndex(t => best.name.includes(t))
            if (bestTier < equippedTier) {
                bot.equip(best, slot).catch(() => { })
            }
        }
    }, 30000)

    // ===== AUTO CRAFT =====
    const CRAFT_PRIORITIES = [
        { item: 'crafting_table', ingredients: { planks: 4 } },
        { item: 'wooden_pickaxe', ingredients: { planks: 3, stick: 2 } },
        { item: 'stone_pickaxe', ingredients: { cobblestone: 3, stick: 2 } },
        { item: 'iron_pickaxe', ingredients: { iron_ingot: 3, stick: 2 } },
        { item: 'diamond_pickaxe', ingredients: { diamond: 3, stick: 2 } },
        { item: 'wooden_sword', ingredients: { planks: 2, stick: 1 } },
        { item: 'stone_sword', ingredients: { cobblestone: 2, stick: 1 } },
        { item: 'iron_sword', ingredients: { iron_ingot: 2, stick: 1 } },
        { item: 'diamond_sword', ingredients: { diamond: 2, stick: 1 } },
        { item: 'stick', ingredients: { planks: 2 } },
        { item: 'torch', ingredients: { coal: 1, stick: 1 } },
        { item: 'chest', ingredients: { planks: 8 } },
        { item: 'furnace', ingredients: { cobblestone: 8 } },
        { item: 'bread', ingredients: { wheat: 3 } },
    ]

    async function runCrafting(bot) {
        if (!dashState.tasks.autoCraft) return
        const mcData = require('minecraft-data')(bot.version)
        const table = bot.findBlock({ matching: b => b?.name === 'crafting_table', maxDistance: 5 })

        for (const recipe of CRAFT_PRIORITIES) {
            // Skip if bot already has enough
            const existing = bot.inventory.items().find(i => i.name === recipe.item)
            if (existing && existing.count >= 2) continue

            // Check if ingredients available
            const canCraft = Object.entries(recipe.ingredients).every(([ing, amt]) => {
                const found = bot.inventory.items().filter(i => i.name.includes(ing))
                return found.reduce((sum, i) => sum + i.count, 0) >= amt
            })
            if (!canCraft) continue

            try {
                const recipeData = bot.recipesFor(mcData.itemsByName[recipe.item]?.id, null, 1, table)?.[0]
                if (!recipeData) continue
                if (table) await bot.pathfinder.goto(new GoalNear(table.position.x, table.position.y, table.position.z, 2))
                await bot.craft(recipeData, 1, table)
                dashState.stats.itemsCrafted++
                syncDash()
                console.log(`🔨 Crafted: ${recipe.item}`)
                break // craft one thing per interval
            } catch (e) { }
        }
    }

    setInterval(() => runCrafting(bot), 45000)

    // ===== DIAMOND MINING =====
    setInterval(() => {
        if (!dashState.tasks.mining) return
        if (bot.entity.position.y > -54) {
            bot.pathfinder.setGoal(new GoalNear(
                bot.entity.position.x, bot.entity.position.y - 5,
                bot.entity.position.z, 1))
            return
        }
        const diamond = bot.findBlock({ matching: b => b?.name.includes('diamond_ore'), maxDistance: 6 })
        if (diamond) {
            bot.tool.equipForBlock(diamond)
                .then(() => bot.dig(diamond))
                .then(() => { dashState.stats.blocksMined++; syncDash() })
                .catch(() => { })
        }
    }, 60000)

    // ===== AUTO HOUSE BUILD =====
    setInterval(() => {
        const block = bot.inventory.items().find(i => i.name.includes('planks'))
        if (!block) return
        const base = bot.blockAt(bot.entity.position.offset(1, -1, 0))
        if (!base) return
        bot.equip(block, 'hand')
            .then(() => bot.placeBlock(base, new Vec3(0, 1, 0)))
            .catch(() => { })
    }, 120000)
}

startBot(Math.random() * 5000)