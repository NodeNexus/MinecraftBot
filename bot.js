const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals:{GoalFollow} } = require('mineflayer-pathfinder')
const express = require('express')
const net = require('net')

process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)

const HOST = 'muth.aternos.me'
const PORT = 37604
const USER = 'SOMUTHAI'
const VERSION = '1.21.11'

const app = express()
app.get('/', (req,res)=>res.send('BOT RUNNING'))
app.listen(3000)

let reconnectDelay = 30000

function pingServer(cb){
  const socket = new net.Socket()
  socket.setTimeout(5000)

  socket.on('connect', ()=>{
    socket.destroy()
    cb(true)
  })

  socket.on('error', ()=>{
    socket.destroy()
    cb(false)
  })

  socket.on('timeout', ()=>{
    socket.destroy()
    cb(false)
  })

  socket.connect(PORT, HOST)
}

function startBot(){

  const randomDelay = Math.floor(Math.random()*15000)
  console.log("Waiting random join delay:", randomDelay)

  setTimeout(()=>{

    pingServer((online)=>{

      if(!online){
        console.log("Server offline retry in 30s")
        return setTimeout(startBot,30000)
      }

      createBot()

    })

  },randomDelay)

}

function createBot(){

  console.log("Creating bot...")

  let reconnecting = false

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USER,
    version: VERSION,
    keepAlive: true,
    checkTimeoutInterval: 60000
  })

  bot.loadPlugin(pathfinder)

  bot.once("spawn", ()=>{

    console.log("✅ Joined server")

    // VERY LONG WARMUP (critical)
    setTimeout(()=>{
      bot.chat("/login 123456")
    },20000)

    setTimeout(()=>{
      startSystems(bot)
    },45000)

  })

  bot.on("kicked",(r)=>{
    console.log("KICKED:",r)
    reconnect()
  })

  bot.on("end",()=>{
    console.log("Connection ended")
    reconnect()
  })

  bot.on("error",(e)=>{
    console.log("Error:",e.message)
  })

  function reconnect(){

    if(reconnecting) return
    reconnecting = true

    console.log("Reconnect in", reconnectDelay)

    setTimeout(()=>{
      reconnectDelay = Math.min(reconnectDelay*1.5, 180000)
      startBot()
    },reconnectDelay)

  }

}

function startSystems(bot){

  console.log("Starting systems")

  const move = new Movements(bot)
  bot.pathfinder.setMovements(move)

  // soft anti kick start
  setInterval(()=>{
    bot.setControlState('sneak',true)
    setTimeout(()=>bot.setControlState('sneak',false),2000)
  },60000)

  setInterval(()=>{
    const yaw=Math.random()*Math.PI*2
    const pitch=(Math.random()-0.5)*Math.PI/2
    bot.look(yaw,pitch,true)
  },30000)

  setInterval(()=>{
    bot.setControlState('jump',true)
    setTimeout(()=>bot.setControlState('jump',false),300)
  },45000)

  // night msg
  let said=false
  bot.on('time',()=>{
    if(bot.time.timeOfDay>13000 && bot.time.timeOfDay<23000){
      if(!said){ bot.chat("Sota Kya Lawde"); said=true }
    } else said=false
  })

  // advancement msg
  bot.on('messagestr',(m)=>{
    const t=m.toString()
    if(t.includes('advancement')||t.includes('goal')||t.includes('challenge')){
      bot.chat("Mutthi Maarle")
    }
  })

}

startBot()
