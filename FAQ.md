# Common Issues
- **`Error: connect ECONNREFUSED`**
	- Minecraft refused to connect with mce-nano. Most likely due to:
		- You have not opened your game to LAN in Minecraft settings.
		- Your LAN port is incorrect. Make sure the port in `config.yml` matches the one shown in Minecraft.
		- Your Minecraft version does not match the `minecraft_version` in `config.yml`.
		- The server is not running or is firewalled.

- **`ERR_MODULE_NOT_FOUND` or missing package errors**
	- You are missing an npm package. Run `npm install` in your project directory.
	- If issues persist, delete the `node_modules` folder and run `npm install` again.

- **`Failed to load keys.json` or API key errors**
	- Make sure you have copied `keys.example.json` to `keys.json` and filled in the required API keys.
	- Save the file after editing, especially if using VS Code.
	- Double-check for typos in key names.

- **`No bots defined in config.yml.`**
	- You must define at least one bot in the `bots:` section of `config.yml`. See the example in the file.

- **`My brain disconnected, try again` or LLM API errors**
	- Something is wrong with the LLM API. Possible causes:
		- Wrong or missing API key.
		- Exceeded rate limits.
		- Provider is down or misconfigured.
		- Check the console output for more details.

- **Bot gets stuck or doesn't move as expected**
	- Mineflayer's pathfinder is not perfect and may get stuck on complex terrain.
	- Try updating your dependencies: delete `node_modules` and run `npm install`.
	- Make sure your bot has permission to move and is not blocked by world protection plugins.

- **Docker issues**
	- If the bot does not start in Docker, ensure your `config.yml`, `keys.json`, and other files are present and correctly mounted.
	- Check that the port in `docker-compose.yml` matches your Minecraft LAN port.

- **`Cannot find module 'mineflayer'` or similar**
	- Run `npm install` to install dependencies.
	- If using Docker, rebuild the image with `docker-compose build`.

- **Bot does not respond to chat**
	- For single-bot setups, the bot listens to global chat.
	- For two-bot setups, the bot only responds to `/msg <botname> <message>`.
	- Make sure you are messaging the correct bot username.

# Common Questions
- **How do I add a new bot?**
	- Edit `config.yml` and add a new entry under `bots:`. Each bot needs a unique `username` and can have its own model, provider, and settings.

- **How do I use a different LLM provider (OpenAI, Gemini, Ollama, Andy, etc.)?**
	- Set the `provider` and `model` fields for your bot in `config.yml`.
	- Add the corresponding API key to `keys.json` (not all providers require a key, e.g., Ollama by default).

- **How do I persist conversation history?**
	- Set `save_conversation: true` for your bot in `config.yml`. Conversation will be saved to `conversations/<username>.json`.

- **How do I run mce-nano in Docker?**
	- Build and run with `docker-compose up --build`.
	- Make sure your config and keys files are present and mapped into the container.

- **How do I update mce-nano?**
	- Pull the latest code, then run `npm install` to update dependencies.

- **What commands are available?**
	- See the `prompt.txt` for a full list of supported commands and their parameters.
	- Example: `!goToPlayer("player_name", closeness)`

- **Can me or the bot use quoted and unquoted parameters in commands?**
	- Yes! The parser supports both quoted strings and numbers, as well as unquoted strings and numbers. You can mix and match.

- **How do I reset the bot or clear chat history?**
	- Use `!restart` to disconnect and reconnect the bot.
	- Use `!clearChat` to clear the conversation history.

- **Does mce-nano support mods or texture packs?**
	- Only client-side mods like Optifine or Sodium are supported, and even then, compatibility is not guaranteed.
	- Mods that change game mechanics or add new blocks/entities are not supported.

- **Baritone support?**
	- Baritone is not supported. mce-nano uses mineflayer's pathfinder.
