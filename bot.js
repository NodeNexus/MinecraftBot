const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalBlock, GoalFollow } } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const toolPlugin = require('mineflayer-tool').plugin
const pvp = require('mineflayer-pvp').plugin
// mineflayer-armor-manager removed — incompatible with 1.21.x (null registry crash on exp bottles)
const { Vec3 } = require('vec3')
const express = require('express')
const net = require('net')
const fs = require('fs')
const path = require('path')

// ===== SINGLE-INSTANCE LOCK =====
const LOCK_FILE = path.join(__dirname, 'bot.lock')
if (fs.existsSync(LOCK_FILE)) {
    const oldPid = fs.readFileSync(LOCK_FILE, 'utf8').trim()
    console.log(`⚠️  Another bot instance may be running (PID ${oldPid}). Remove bot.lock if it crashed.`)
    // Check if the PID is actually still alive
    try { process.kill(Number(oldPid), 0); console.error('❌ Bot already running! Exiting.'); process.exit(1) }
    catch (e) { /* stale lock — process is dead, continue */ console.log('🔓 Stale lock found, taking over.') }
}
fs.writeFileSync(LOCK_FILE, String(process.pid))
const cleanupLock = () => { try { fs.unlinkSync(LOCK_FILE) } catch (e) { } }
process.on('exit', cleanupLock)
process.on('SIGINT', () => { cleanupLock(); process.exit() })
process.on('SIGTERM', () => { cleanupLock(); process.exit() })

process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)

const HOST = 'muth.aternos.me'
const PORT = 37604
const USERNAME = 'SomuUltraAI'
const VERSION = '1.21.11'

const app = express()
app.get('/', (req, res) => res.send("ULTRA AI BOT"))
app.listen(3000)

function pingServer(cb) {
    const s = new net.Socket()
    s.setTimeout(5000)
    s.on('connect', () => { s.destroy(); cb(true) })
    s.on('error', () => { s.destroy(); cb(false) })
    s.on('timeout', () => { s.destroy(); cb(false) })
    s.connect(PORT, HOST)
}

function startBot() {
    const delay = Math.random() * 15000
    setTimeout(() => {
        pingServer(ok => {
            if (!ok) return setTimeout(startBot, 30000)
            createBot()
        })
    }, delay)
}

function createBot() {

    let reconnecting = false

    const bot = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: USERNAME,
        version: VERSION,
        keepAlive: true
    })

    bot.loadPlugin(pathfinder)
    bot.loadPlugin(collectBlock)
    bot.loadPlugin(toolPlugin)
    bot.loadPlugin(pvp)
    // armorManager plugin removed — handled manually below

    bot.once("spawn", () => {
        console.log("Joined")

        const move = new Movements(bot)
        bot.pathfinder.setMovements(move)

        setTimeout(() => bot.chat("/login 123456"), 20000)
        setTimeout(() => startBrain(bot), 45000)
    })

    bot.on("kicked", (r) => {
        console.log("Kicked", r)
        // If kicked for duplicate login, the old session is still alive on the server.
        // Wait longer so the previous session times out before reconnecting.
        const reason = JSON.stringify(r)
        if (reason.includes('duplicate_login')) {
            console.log('⚠️  Duplicate login detected — waiting 3 minutes for old session to expire...')
            if (!reconnecting) { reconnecting = true; setTimeout(() => startBot(), 180000) }
        } else {
            reconnect()
        }
    })
    bot.on("end", () => { console.log("End"); reconnect() })

    function reconnect() {
        if (reconnecting) return
        reconnecting = true
        setTimeout(() => startBot(), 60000)
    }

}

function startBrain(bot) {

    console.log("🧠 ULTRA BRAIN ACTIVE")

    // ===== ROAM =====
    setInterval(() => {
        const x = bot.entity.position.x + (Math.random() * 120 - 60)
        const z = bot.entity.position.z + (Math.random() * 120 - 60)
        bot.pathfinder.setGoal(new GoalNear(x, bot.entity.position.y, z, 1))
    }, 90000)

    // ===== INVENTORY BRAIN =====
    setInterval(() => {
        const trash = ["dirt", "cobblestone"]
        trash.forEach(name => {
            const item = bot.inventory.items().find(i => i.name.includes(name))
            if (item && item.count > 128) {
                bot.tossStack(item)
            }
        })
    }, 60000)

    // ===== TREE CUT =====
    setInterval(() => {
        const tree = bot.findBlock({
            matching: b => b && b.name.includes("log"),
            maxDistance: 6
        })
        if (!tree) return
        bot.tool.equipForBlock(tree).then(() => bot.dig(tree)).catch(() => { })
    }, 50000)

    // ===== FARMING =====
    setInterval(() => {
        const crop = bot.findBlock({
            matching: b => b && b.name === "wheat",
            maxDistance: 5
        })
        if (crop) {
            bot.dig(crop)
            return
        }

        const farmland = bot.findBlock({
            matching: b => b && b.name === "farmland",
            maxDistance: 5
        })

        const seed = bot.inventory.items().find(i => i.name.includes("wheat_seeds"))
        if (farmland && seed) {
            bot.equip(seed, "hand")
            bot.placeBlock(farmland, new Vec3(0, 1, 0)).catch(() => { })
        }

    }, 40000)

    // ===== MOB FIGHT =====
    setInterval(() => {
        const mob = bot.nearestEntity(e => e.type === "mob")
        if (mob) bot.pvp.attack(mob)
    }, 15000)

    // ===== AUTO EAT =====
    setInterval(() => {
        if (bot.food === 20) return
        const food = bot.inventory.items().find(i =>
            i.name.includes("bread") ||
            i.name.includes("beef") ||
            i.name.includes("pork")
        )
        if (food) {
            bot.equip(food, "hand").then(() => bot.consume()).catch(() => { })
        }
    }, 20000)

    // ===== AUTO ARMOR (manual, replaces mineflayer-armor-manager) =====
    const ARMOR_SLOTS = {
        head: { slot: 5, names: ["helmet"] },
        chest: { slot: 6, names: ["chestplate"] },
        legs: { slot: 7, names: ["leggings"] },
        feet: { slot: 8, names: ["boots"] },
    }
    const TIERS = ['netherite', 'diamond', 'iron', 'golden', 'chainmail', 'leather']
    setInterval(() => {
        for (const [, { slot, names }] of Object.entries(ARMOR_SLOTS)) {
            const equipped = bot.inventory.slots[slot]
            const best = bot.inventory.items().filter(i => names.some(n => i.name.includes(n))).sort((a, b) => {
                return TIERS.findIndex(t => b.name.includes(t)) - TIERS.findIndex(t => a.name.includes(t))
            })[0]
            if (best && (!equipped || TIERS.findIndex(t => best.name.includes(t)) < TIERS.findIndex(t => (equipped.name || '').includes(t)))) {
                bot.equip(best, 'head').catch(() => { }) // mineflayer equip by destination slot resolves armor slots
            }
        }
    }, 30000)

    // ===== DIAMOND MINING (strip logic) =====
    setInterval(() => {

        if (bot.entity.position.y > -54) {
            bot.pathfinder.setGoal(new GoalNear(
                bot.entity.position.x,
                bot.entity.position.y - 5,
                bot.entity.position.z, 1))
            return
        }

        const diamond = bot.findBlock({
            matching: b => b && b.name.includes("diamond_ore"),
            maxDistance: 6
        })

        if (diamond) {
            bot.tool.equipForBlock(diamond)
                .then(() => bot.dig(diamond))
                .catch(() => { })
        }

    }, 60000)

    // ===== AUTO HOUSE BUILD =====
    setInterval(() => {

        const block = bot.inventory.items().find(i => i.name.includes("planks"))
        if (!block) return

        const base = bot.blockAt(bot.entity.position.offset(1, -1, 0))
        if (!base) return

        bot.equip(block, "hand")
            .then(() => bot.placeBlock(base, new Vec3(0, 1, 0)))
            .catch(() => { })

    }, 120000)

}

startBot()