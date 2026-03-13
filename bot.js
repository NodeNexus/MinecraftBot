const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalFollow } } = require('mineflayer-pathfinder')
const express = require('express')

const app = express()
app.get('/', (req, res) => res.send('SOMUTHAI RUNNING'))
app.listen(3000)

function startBot() {

console.log("Starting Bot...")

let reconnecting = false

const bot = mineflayer.createBot({
    host: 'muth.aternos.me',
    port: 37604,
    username: 'SOMUTHAI',
    version: '1.21.11',
    keepAlive: true,
    checkTimeoutInterval: 60000
})

bot.loadPlugin(pathfinder)

bot.once("spawn", () => {

    console.log("✅ Bot joined server")

    const defaultMove = new Movements(bot)
    bot.pathfinder.setMovements(defaultMove)

    setTimeout(() => {
        bot.chat("/login 123456")
    }, 12000)

    setTimeout(() => {
        startSystems(bot)
    }, 20000)

})

bot.on("chat", (user, msg) => {

    if (user === bot.username) return

    if (msg === "follow" || msg === "come") follow(bot, user)

    if (msg === "stop") {
        bot.pathfinder.setGoal(null)
        bot.clearControlStates()
    }

    if (msg === "jump") {
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 400)
    }

})

bot.on("death", () => {
    console.log("Bot died → respawn")
    setTimeout(() => bot.spawn(), 3000)
})

bot.on("kicked", (r) => {
    console.log("KICKED:", r)
    reconnect()
})

bot.on("end", () => {
    console.log("Connection ended")
    reconnect()
})

bot.on("error", (e) => {
    console.log("Error:", e.message)
})

function reconnect() {

    if (reconnecting) return
    reconnecting = true

    console.log("🔄 Reconnecting in 20s")

    setTimeout(() => {
        startBot()
    }, 20000)

}

}

function follow(bot, name) {
    const target = bot.players[name]?.entity
    if (!target) return bot.chat("cant see you")
    bot.pathfinder.setGoal(new GoalFollow(target, 2), true)
}

function startSystems(bot) {

    superAntiKick(bot)
    nightMessage(bot)
    advancementReply(bot)
    randomRoast(bot)
    abuseReply(bot)
    autoEat(bot)

}

function autoEat(bot) {

    setInterval(() => {

        if (bot.food === 20) return

        const food = bot.inventory.items().find(i =>
            i.name.includes('bread') ||
            i.name.includes('beef') ||
            i.name.includes('pork') ||
            i.name.includes('chicken')
        )

        if (!food) return

        bot.equip(food, 'hand')
            .then(() => bot.consume())
            .catch(() => { })

    }, 15000)

}

function superAntiKick(bot) {

    setInterval(() => {
        const moves = ['forward', 'back', 'left', 'right']
        const m = moves[Math.floor(Math.random() * moves.length)]
        bot.setControlState(m, true)
        setTimeout(() => bot.setControlState(m, false), 2000)
    }, 30000)

    setInterval(() => {
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 400)
    }, 25000)

    setInterval(() => {
        const yaw = Math.random() * Math.PI * 2
        const pitch = (Math.random() - 0.5) * Math.PI / 2
        bot.look(yaw, pitch, true)
    }, 20000)

}

function nightMessage(bot) {

    let said = false

    bot.on('time', () => {

        if (bot.time.timeOfDay > 13000 && bot.time.timeOfDay < 23000) {

            if (!said) {
                bot.chat("Sota Kya Lawde")
                said = true
            }

        } else said = false

    })

}

function advancementReply(bot) {

    bot.on('messagestr', (m) => {

        const t = m.toString()

        if (t.includes('advancement') || t.includes('goal') || t.includes('challenge')) {
            bot.chat("Mutthi Maarle")
        }

    })

}

function randomRoast(bot) {

    const roasts = [
        "tu dirt bhi nahi tod sakta",
        "tera aim potato",
        "creative me bhi mar gaya",
        "inventory me hawa hai",
        "mining karega ya picnic"
    ]

    setInterval(() => {

        const players = Object.keys(bot.players).filter(p => p !== bot.username)
        if (players.length === 0) return

        const target = players[Math.floor(Math.random() * players.length)]
        const roast = roasts[Math.floor(Math.random() * roasts.length)]

        bot.chat(target + " " + roast)

    }, 180000)

}

function abuseReply(bot) {

    const abuse = ["noob", "bot", "idiot", "chutiya", "bsdk", "gandu", "madarchod"]

    bot.on('chat', (u, m) => {

        if (u === bot.username) return

        const msg = m.toLowerCase()

        if (msg.includes(bot.username.toLowerCase()) &&
            abuse.some(a => msg.includes(a))) {

            setTimeout(() => bot.chat("Gand Mara bosdike"), 1000)

        }

    })

}

startBot()
