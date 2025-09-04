<h1 align="center">mce-nano</h1>
<h3 align="center">
  Mindcraft Community Edition Nano 🧠🤏
</h3>

<h4 align="center">
  Maintained by 
  <a href="https://github.com/uukelele-scratch">@uukelele-scratch</a>, 
  <a href="https://github.com/sweaterdog">@Sweaterdog</a>,
  <a href="https://github.com/riqvip">@riqvip</a>,
  <a href="https://github.com/mrelmida">@MrElmida</a>, and
  the community.
</h4>

<p align="center">
  Crafting minds for Minecraft with LLMs and <a href="https://prismarinejs.github.io/mineflayer/#/">mineflayer</a>!
</p>

<p align="center">
  <a href="/FAQ.md">FAQ</a> |
  <a href="https://discord.gg/DNnBQvCtwr">Discord Support</a>
</p>

> [!Note]
> This is a lightweight reimplementation of mindcraft, built from scratch designed to run on low-end hardware. It does not include most features present in [the community edition](https://github.com/mindcraft-ce/mindcraft-ce) or [the original mindcraft](https://github.com/mindcraft-bots/mindcraft).

The open-source platform for crafting intelligent, collaborative agents in Minecraft using Large Language Models.

## What is this about?

**mce-nano** is a lightweight, open-source platform for running intelligent, LLM-powered Minecraft bots using [mineflayer](https://prismarinejs.github.io/mineflayer/#/). It is designed for simplicity, low resource usage, and easy customization, making it ideal for running on low-end hardware, servers, or as a starting point for your own Minecraft AI experiments.

- **Minimalist**: No bloat, just the essentials for LLM-driven Minecraft automation.
- **Multi-Provider**: Supports OpenAI, Gemini, Andy API, Ollama, Pollinations, and more.
- **Configurable**: Each bot can have its own model, provider, and personality in config.yml.
- **Conversation-Aware**: Optionally saves and reloads conversation history per bot.
- **Docker-Ready**: Simple Dockerfile and docker-compose for easy deployment.
- **Community-Driven**: Maintained by contributors from the Mindcraft community.

## Feature Comparison

| Feature                | mindcraft-ce (Community Edition) | mce-nano (Nano Edition)          |
|------------------------|:--------------------------------:|:--------------------------------:|
| **Development Status** | Active                           | **Active**                       |
| **Minecraft Version**  | Up to 1.21.6                    | Up to **1.21.6**                |
| **Node.js Version**    | v18+ (v22 recommended)          | **v18+**                         |
| **Setup Complexity**   | Complex (many dependencies)     | **Minimal (essential deps only)**|
| **Multi-Bot Support**  | Yes                              | **Yes (per-bot configs)**        |
| **Auto-Actions**       | Manual commands                  | **Auto-eat, auto-defense, idle actions** |
| **Chat Restrictions**  | Global only                      | **Public/private + player whitelist** |
| **Resource Usage**     | High (full feature set)         | **Ultra-lightweight**            |
| **Memory Footprint**   | Large codebase                   | **Minimal core**                 |
| **Docker Image Size**  | ~500MB+                          | **<200MB**                       |
| **Plugin System**      | Complex plugin architecture     | **Simple, hackable core**        |
| **Learning Curve**     | Steep (many features)           | **Gentle (focused essentials)**  |
| **Fork Friendly**      | Heavy customization required    | **Easy to modify & extend**      |
| **Boot Time**          | Slower startup                   | **Fast startup**                 |
| **Model Providers**    | 15+ providers                    | **10+ essential providers**      |
| **Low-End Hardware**   | Struggles on weak systems       | **Optimized for Raspberry Pi+**  |
| **Configuration**      | Multiple config files           | **Single config.yml**            |
| **Ideal For**          | Production & feature-rich bots  | **Learning, prototyping, servers**|

## Requirements

- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc) (up to v1.21.6)
- [Node.js](https://nodejs.org/) (v18 or newer)
- [git](https://git-scm.com/downloads/)
- (Optional) API key for your chosen LLM provider (see keys.example.json)
- (Optional) [Docker](https://www.docker.com/) for containerized deployment

## Quick Start

1. **Clone the repo:**
   ```sh
   git clone https://github.com/yourusername/mce-nano.git
   cd mce-nano
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Copy and edit your keys:**
   - Copy keys.example.json to keys.json and add your API keys (see FAQ for help).

4. **Edit your bot config:**
   - Edit config.yml to set up your bot(s), model, provider, and options.

5. **Start Minecraft and open to LAN** (default port: 55916).

6. **Run the bot:**
   ```sh
   node main.js
   ```
   Or use Docker:
   ```sh
   docker-compose up --build
   ```

## Configuration

- **Bots:** Each entry in config.yml under `bots:` defines a bot with its own username, model, provider, and options.
- **Providers:** Supported providers include OpenAI, Gemini, Andy API, Ollama, Pollinations, and more.
- **Conversation:** Enable `save_conversation: true` to persist chat history for each bot.
- **Interactive:** `idle_timeout_seconds` and `idle_message` can make the bot active when nothing is happening.

See the comments in config.yml for more details.

## Commands

Bots support a wide range of commands, including movement, inventory, crafting, and more. Commands are listed in prompt.txt.  
Example usage:  
`!goToPlayer("player_name", 2)`  
`!searchForBlock("oak_log", 16)`

Parameters can be quoted or unquoted, and the parser is flexible.

## Troubleshooting & FAQ

- See FAQ.md for solutions to common errors and setup questions.
- Join the [Discord Support](https://discord.gg/DNnBQvCtwr) for help and discussion.

## Credits

Maintained by [@uukelele-scratch](https://github.com/uukelele-scratch), [@Sweaterdog](https://github.com/sweaterdog), [@riqvip](https://github.com/riqvip), [@MrElmida](https://github.com/mrelmida), and the community.

## License

MIT License. See LICENSE for details.
