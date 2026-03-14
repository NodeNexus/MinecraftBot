# 🤖 Somu Ultra AI Minecraft Bot

An **autonomous survival AI Minecraft bot** built using **Mineflayer**, designed to behave like a real survival player.

The bot can roam, farm, mine, fight mobs, build simple structures, manage inventory, and interact in chat — making it suitable for experimentation with game automation and AI behavior.

---

## 🚀 Features

### 🧠 Survival AI

* Random world roaming (chunk loading behavior)
* Tree detection and automatic chopping
* Strip-mining logic for diamond search
* Mob detection and combat (PvE)
* Automatic eating when hunger is low
* Night sleep system (bed usage)

### 🌾 Farming System

* Detects wheat crops and harvests
* Plants seeds on nearby farmland
* Maintains basic crop cycle

### 🏠 Building System

* Places blocks to form simple shelter structures
* Gradual base expansion logic

### 🎒 Inventory Brain

* Drops excessive low-value items (dirt / cobblestone)
* Auto equips tools for correct block breaking
* Basic resource awareness

### 💬 Chat Interaction

* Follow / come commands
* Jump command
* Random player roasting messages
* Advancement reaction messages
* Night-time dialogue

### ⚔ Combat AI

* Detects nearby hostile mobs
* Engages automatically using PvP plugin

### 🔄 Stability System

* Server ping check before join
* Random join delay (anti-rate-limit)
* Smart reconnect with exponential backoff
* Crash protection handlers
* Render keep-alive HTTP server

---

## 🧰 Tech Stack

* Node.js
* Mineflayer
* mineflayer-pathfinder
* mineflayer-collectblock
* mineflayer-tool
* mineflayer-pvp
* mineflayer-armor-manager
* Express (for uptime monitoring)

---

## 📦 Installation

### 1️⃣ Clone repository

```bash
git clone https://github.com/YOUR_USERNAME/somu-ultra-ai-bot.git
cd somu-ultra-ai-bot
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Start bot

```bash
npm start
```

---

## ⚙️ Configuration

Edit `bot.js`:

```js
const HOST = "your_server_address"
const PORT = 25565
const USERNAME = "BotName"
const VERSION = "1.21.1"
```

If server has login plugin:

```js
bot.chat("/login password")
```

---

## ☁️ Deploy on Render (24×7)

1. Push project to GitHub
2. Create **Render Web Service**
3. Settings:

   * Environment → Node
   * Build → `npm install`
   * Start → `npm start`
4. Add UptimeRobot monitor to prevent sleeping

---

## ⚠️ Notes about Aternos

* Aternos may detect long idle sessions
* Survival-style activity reduces detection
* Full 24×7 uptime is **not guaranteed on free hosting**

---

## 🎯 Future Improvements

* Full crafting tech tree AI
* Chest storage warehouse system
* Advanced house blueprint builder
* Danger avoidance (lava / creeper escape)
* Multi-bot colony coordination
* Memory navigation / home return

---

## 📜 License

MIT License — free to use and modify.

---

## ⭐ Author

Created for experimentation with **game automation + AI behaviour** in Minecraft.

If you like this project, consider ⭐ starring the repo.
