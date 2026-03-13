const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalFollow } } = require('mineflayer-pathfinder')
const express = require('express')

const app = express()
app.get('/', (req, res) => res.send('SOMUTHAI Running'))
app.listen(3000)

function startBot() {

    console.log("Starting SOMUTHAI...")

    const bot = mineflayer.createBot({
        host: 'muth.aternos.me',
        port: 37604,
        username: 'SOMUTH_AI',
        version: '1.21.11'
    })

    bot.loadPlugin(pathfinder)

    let afkLoop
    let reconnecting = false

    bot.once('spawn', () => {

        console.log("Joined server")

        const defaultMove = new Movements(bot)
        bot.pathfinder.setMovements(defaultMove)

        setTimeout(() => {
            bot.chat('/login 123456')
        }, 5000)

        superAntiKick(bot)
        nightMessage(bot)
        advancementReply(bot)
        randomRoast(bot)
        abuseReply(bot)
        autoEat(bot)

    })

    bot.on('chat', (user, msg) => {

        if (user === bot.username) return

        if (msg === 'follow' || msg === 'come') follow(user)

        if (msg === 'stop') {
            bot.pathfinder.setGoal(null)
            bot.clearControlStates()
        }

        if (msg === 'jump') {
            bot.setControlState('jump', true)
            setTimeout(() => bot.setControlState('jump', false), 400)
        }

    })

    bot.on('death', () => {
        console.log("Bot died respawning")
        setTimeout(() => bot.spawn(), 3000)
    })

    bot.on('end', reconnect)
    bot.on('kicked', reconnect)

    bot.on('error', (err) => {
        console.log("Error:", err.message)
        reconnect()
    })

    function reconnect() {
        if (reconnecting) return
        reconnecting = true
        clearInterval(afkLoop)
        console.log("Reconnecting in 10s")
        setTimeout(startBot, 10000)
    }

    function follow(name) {
        const target = bot.players[name]?.entity
        if (!target) return bot.chat("cant see you")
        bot.chat("following")
        bot.pathfinder.setGoal(new GoalFollow(target, 2), true)
    }

    function autoEat(bot) {
        setInterval(() => {
            if (bot.food === 20) return
            const food = bot.inventory.items().find(i => i.name.includes('bread') || i.name.includes('beef') || i.name.includes('pork') || i.name.includes('chicken'))
            if (!food) return
            bot.equip(food, 'hand').then(() => bot.consume()).catch(() => { })
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
            bot.setControlState('sneak', true)
            setTimeout(() => bot.setControlState('sneak', false), 3000)
        }, 45000)

        setInterval(() => {
            const yaw = Math.random() * Math.PI * 2
            const pitch = (Math.random() - 0.5) * Math.PI / 2
            bot.look(yaw, pitch, true)
        }, 20000)

        setInterval(() => {
            const msgs = ["hi", "ok", "lol", "nice", "hmm", "brb"]
            bot.chat(msgs[Math.floor(Math.random() * msgs.length)])
        }, 120000)

    }

    function nightMessage(bot) {

        let said = false

        bot.on('time', () => {
            if (bot.time.timeOfDay > 13000 && bot.time.timeOfDay < 23000) {
                if (!said) {
                    bot.chat("Sota Kya Lawde")
                    said = true
                }
            } else {
                said = false
            }
        })

    }

    function advancementReply(bot) {

        bot.on('messagestr', (msg) => {
            const t = msg.toString()
            if (t.includes('has made the advancement') ||
                t.includes('has completed the advancement') ||
                t.includes('has reached the goal') ||
                t.includes('has completed the challenge')) {
                bot.chat("Mutthi Maarle")
            }
        })

    }

    function randomRoast(bot) {

        const roasts = [
            "Tu dirt bhi nahi tod sakta",
            "Creative me bhi mar gaya tha kya",
            "Tera aim potato hai",
            "Zombie bhi tujhe ignore karta",
            "Inventory me hawa bhari hai",
            "Mining karega ya picnic",
            "Diamond dekh shock ho jata",
            "Bed bhi tujhe respawn nahi chahta"
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

        const abuse = ["noob", "bot", "stupid", "idiot", "chutiya", "madarchod", "bhosdike", "bsdk", "lund", "gandu"]

        bot.on('chat', (username, message) => {
            if (username === bot.username) return
            const msg = message.toLowerCase()
            const targeted = msg.includes(bot.username.toLowerCase())
            const abused = abuse.some(w => msg.includes(w))
            if (targeted && abused) {
                setTimeout(() => bot.chat("Gand Mara bosdike"), 1000)
            }
        })

    }

}

startBot()