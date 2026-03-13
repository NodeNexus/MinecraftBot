const mineflayer=require('mineflayer')
const {pathfinder,Movements,goals:{GoalFollow}}=require('mineflayer-pathfinder')
const express=require('express')
const Groq=require('groq-sdk')

const groq=new Groq({apiKey:process.env.GROQ_KEY})

const app=express()
app.get('/',(req,res)=>res.send('AI BOT RUNNING'))
app.listen(3000)

function startBot(){

console.log("Starting AI Bot...")

const bot=mineflayer.createBot({
host:'muth.aternos.me',
port:37604,
username:'SOMUTH_AI',
version:'1.21.11'
})

bot.loadPlugin(pathfinder)

let reconnecting=false

bot.once('spawn',()=>{

console.log("Bot joined")

const defaultMove=new Movements(bot)
bot.pathfinder.setMovements(defaultMove)

setTimeout(()=>bot.chat('/login 123456'),5000)

superAntiKick(bot)
nightMessage(bot)
advancementReply(bot)
randomRoast(bot)
abuseReply(bot)
autoEat(bot)
realAIChat(bot)

})

bot.on('chat',(user,msg)=>{
if(user===bot.username)return
if(msg==='follow'||msg==='come')follow(user)
if(msg==='stop'){bot.pathfinder.setGoal(null);bot.clearControlStates()}
})

bot.on('death',()=>setTimeout(()=>bot.spawn(),3000))
bot.on('end',reconnect)
bot.on('kicked',reconnect)
bot.on('error',()=>reconnect())

function reconnect(){
if(reconnecting)return
reconnecting=true
console.log("Reconnecting in 10s")
setTimeout(startBot,10000)
}

function follow(name){
const target=bot.players[name]?.entity
if(!target)return bot.chat("cant see you")
bot.pathfinder.setGoal(new GoalFollow(target,2),true)
}

}

function autoEat(bot){
setInterval(()=>{
if(bot.food===20)return
const food=bot.inventory.items().find(i=>i.name.includes('bread')||i.name.includes('beef')||i.name.includes('pork')||i.name.includes('chicken'))
if(!food)return
bot.equip(food,'hand').then(()=>bot.consume()).catch(()=>{})
},15000)
}

function superAntiKick(bot){
setInterval(()=>{
const m=['forward','back','left','right'][Math.floor(Math.random()*4)]
bot.setControlState(m,true)
setTimeout(()=>bot.setControlState(m,false),2000)
},30000)

setInterval(()=>{
bot.setControlState('jump',true)
setTimeout(()=>bot.setControlState('jump',false),400)
},25000)

setInterval(()=>{
const yaw=Math.random()*Math.PI*2
const pitch=(Math.random()-0.5)*Math.PI/2
bot.look(yaw,pitch,true)
},20000)
}

function nightMessage(bot){
let said=false
bot.on('time',()=>{
if(bot.time.timeOfDay>13000&&bot.time.timeOfDay<23000){
if(!said){bot.chat("Sota Kya Lawde");said=true}
}else said=false
})
}

function advancementReply(bot){
bot.on('messagestr',(m)=>{
const t=m.toString()
if(t.includes('advancement')||t.includes('goal')||t.includes('challenge')){
bot.chat("Mutthi Maarle")
}
})
}

function randomRoast(bot){
const r=["tu dirt bhi nahi tod sakta","tera aim potato","creative me bhi mar gaya","inventory me hawa hai","mining karega ya picnic"]
setInterval(()=>{
const p=Object.keys(bot.players).filter(x=>x!==bot.username)
if(p.length===0)return
const target=p[Math.floor(Math.random()*p.length)]
bot.chat(target+" "+r[Math.floor(Math.random()*r.length)])
},180000)
}

function abuseReply(bot){
const abuse=["noob","bot","idiot","chutiya","bsdk","gandu","madarchod"]
bot.on('chat',(u,m)=>{
if(u===bot.username)return
const msg=m.toLowerCase()
if(msg.includes(bot.username.toLowerCase())&&abuse.some(a=>msg.includes(a))){
setTimeout(()=>bot.chat("Gand Mara bosdike"),1000)
}
})
}

function realAIChat(bot){

bot.on("chat",async(username,message)=>{

if(username===bot.username)return
if(!message.toLowerCase().includes(bot.username.toLowerCase()))return

try{

const completion=await groq.chat.completions.create({
messages:[
{role:"system",content:"You are funny toxic minecraft player. Reply short hinglish."},
{role:"user",content:message}
],
model:"llama3-70b-8192"
})

let reply=completion.choices[0].message.content
reply=reply.substring(0,100)

bot.chat(username+" "+reply)

}catch(e){
bot.chat(username+" lag ho gaya")
}

})

}

startBot()
