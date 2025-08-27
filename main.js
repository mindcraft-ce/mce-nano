// main.js - Mineflayer bot entry point
const mineflayer = require('mineflayer');
const fs = require('fs');
const yaml = require('js-yaml');
const MC_CHAT_LIMIT = 256;

// Load system prompt
let systemPrompt = '';
try {
	systemPrompt = fs.readFileSync('./prompt.txt', 'utf8').trim();
} catch (e) {
	console.error('Failed to load prompt.txt:', e);
	process.exit(1);
}

// Function to replace variables in prompt
function replacePromptVariables(prompt, variables) {
	let result = prompt;
	for (const [key, value] of Object.entries(variables)) {
		const placeholder = `{${key}}`;
		result = result.replace(new RegExp(placeholder, 'g'), value);
	}
	return result;
}

// Command parser from agent.js
const { parseAndExecuteCommands, handleInfoCommand, setMainCallbacks } = require('./agent');

// Load config.yml
let config;
try {
	const file = fs.readFileSync('./config.yml', 'utf8');
	config = yaml.load(file);
} catch (e) {
	console.error('Failed to load config.yml:', e);
	process.exit(1);
}

// Load keys.json
let keys;
try {
	const keysFile = fs.readFileSync('./keys.json', 'utf8');
	keys = JSON.parse(keysFile);
} catch (e) {
	console.error('Failed to load keys.json:', e);
	process.exit(1);
}

// === Multi-bot Setup ===
const bots = Array.isArray(config.bots) ? config.bots : [];
if (bots.length === 0) {
	console.error('No bots defined in config.yml.');
	process.exit(1);
}

function createBotForConfig(botConfig) {
	// Create variables for prompt replacement
	const promptVariables = {
		USERNAME: botConfig.username,
		PERSONALITY: botConfig.personality || 'You are helpful and friendly.',
		// Add more variables here as needed
	};
	
	// Replace variables in system prompt
	const processedPrompt = replacePromptVariables(systemPrompt, promptVariables);
	const saveConversation = botConfig.save_conversation === true;
	const conversationFile = `./conversations/${botConfig.username}.json`;
	let conversation = [
		{ role: 'system', content: processedPrompt }
	];
	if (saveConversation && fs.existsSync(conversationFile)) {
		try {
			const loaded = JSON.parse(fs.readFileSync(conversationFile, 'utf8'));
			if (Array.isArray(loaded) && loaded.length > 0) {
				conversation = loaded;
				// Always ensure system prompt is first
				if (conversation[0].role !== 'system') {
					conversation.unshift({ role: 'system', content: processedPrompt });
				} else {
					conversation[0].content = processedPrompt;
				}
			}
		} catch (e) {
			console.error(`[${botConfig.username}] Failed to load conversation:`, e);
		}
	}
	// === OpenAI/LLM Client Setup ===
	let llmClient = null;
	let llmProvider = botConfig.provider || 'openai';
	let llmModel = botConfig.model || 'gpt-4o-mini';
	let apiKey;

	// Get the appropriate API key based on provider
	if (llmProvider === 'ollama') {
		apiKey = keys.OLLAMA_API_KEY;
	} else if (llmProvider === 'openai') {
		apiKey = keys.OPENAI_API_KEY;
	} else if (llmProvider === 'openrouter') {
		apiKey = keys.OPENROUTER_API_KEY;
	} else if (llmProvider === 'gemini') {
		apiKey = keys.GEMINI_API_KEY;
	} else if (llmProvider === 'andy') {
		apiKey = keys.ANDY_API_KEY;
	} else if (llmProvider === 'pollinations') {
		apiKey = keys.POLLINATIONS_API_KEY;
	} else {
		console.error(`[${botConfig.username}] Provider '${llmProvider}' is not supported yet.`);
		return;
	}

	if (!apiKey) {
		console.error(`[${botConfig.username}] No API key found for provider '${llmProvider}' in keys.json.`);
		return;
	}

	const { OpenAI } = require('openai');
	const openaiOptions = { apiKey };
	if (llmProvider === 'ollama') {
		openaiOptions.baseURL = 'http://localhost:11434/v1';
	} else if (llmProvider === 'openrouter') {
		openaiOptions.baseURL = 'https://openrouter.ai/api/v1';
	} else if (llmProvider === 'gemini') {
		openaiOptions.baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
	} else if (llmProvider === 'andy') {
		openaiOptions.baseURL = 'https://andy.mindcraft-ce.com/api/v1';
	} else if (llmProvider === 'pollinations') {
		openaiOptions.baseURL = 'https://text.pollinations.ai/openai';
	}
	llmClient = new OpenAI(openaiOptions);

	let bot;
	let reconnectAttempted = false;
	function createBot() {
		   const actionChatFeedback = botConfig.action_chat_feedback !== false;
		   const actionConversationFeedback = botConfig.action_conversation_feedback !== false;
		   setMainCallbacks({
			   clearChat: () => {
				   conversation.length = 1; // keep system prompt only
				   console.log(`[${botConfig.username}] Conversation history cleared.`);
				   if (saveConversation) {
					   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
				   }
			   },
			   restart: () => {
				   console.log(`[${botConfig.username}] Leave/disconnect requested by command.`);
				   if (saveConversation) {
					   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
				   }
				   bot.quit();
			   },
			   pushAssistantMessage: (msg) => {
				   if (actionConversationFeedback) conversation.push({ role: 'assistant', content: msg });
				   if (saveConversation) {
					   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
				   }
			   },
			   shouldActionChatFeedback: () => actionChatFeedback
		   });
		bot = mineflayer.createBot({
			host: config.host,
			port: config.port,
			username: botConfig.username,
			version: config.minecraft_version ? config.minecraft_version.toString() : undefined
		});

		// === Auto Look At Player Feature ===
		const autoLook = (typeof botConfig.look_at_player === 'boolean') ? botConfig.look_at_player : true;
			let lookInterval = null;
			if (autoLook) {
				bot.once('spawn', () => {
					lookInterval = setInterval(() => {
						// Find nearest player entity (not self)
						const others = Object.values(bot.entities).filter(e => e.type === 'player' && e.username !== bot.username);
						if (others.length > 0) {
							let closest = others[0];
							let minDist = bot.entity.position.distanceTo(closest.position);
							for (const e of others) {
								const dist = bot.entity.position.distanceTo(e.position);
								if (dist < minDist) {
									closest = e;
									minDist = dist;
								}
							}
							if (minDist <= 6) {
								bot.lookAt(closest.position.offset(0, closest.height || 1.6, 0));
							}
						}
					}, 1000);
				});
				bot.on('end', () => { if (lookInterval) clearInterval(lookInterval); });
			}

		bot.on('login', () => {
			reconnectAttempted = false;
			console.log(`[Bot] Logged in as ${botConfig.username}`);
			if (config.init_message) {
				bot.chat(config.init_message);
			}
			

		});

		bot.on('error', (err) => {
			if (!reconnectAttempted) {
				console.error(`[Bot ${botConfig.username}] Error:`, err);
			}
		});

		bot.on('end', (reason) => {
			const msg = reason ? `[Bot ${botConfig.username}] Disconnected: ${reason}` : `[Bot ${botConfig.username}] Disconnected.`;
			console.log(msg);
			if (!reconnectAttempted) {
				reconnectAttempted = true;
				console.log(`[Bot ${botConfig.username}] Attempting reconnect in 5 seconds...`);
				setTimeout(() => {
					try {
						createBot();
					} catch (e) {
						console.error(`[Bot ${botConfig.username}] Couldn't reconnect: `, e.message || e);
					}
				}, 5000);
			} else {
				console.error(`[Bot ${botConfig.username}] Couldn't reconnect: previous attempt failed.`);
			}
		});

		// === Chat/Message Handling ===
		// Helper to send a message in /msg, split if needed
		async function sendMsgToUser(user, text) {
			const parts = [];
			let remaining = text;
			while (remaining.length > 0) {
				parts.push(remaining.slice(0, MC_CHAT_LIMIT - 10));
				remaining = remaining.slice(MC_CHAT_LIMIT - 10);
			}
			for (const part of parts) {
				bot.chat(`/msg ${user} ${part}`);
			}
		}

		// Info commands to handle specially
		const infoCommands = ['stats', 'inventory', 'nearbyBlocks', 'entities', 'savedPlaces', 'viewChest'];

        function extractInfoCommand(message) {
            // Returns info command name if present, else null
            const match = message.match(/!(\w+)(?:\(|$|\s)/);
            if (match && infoCommands.includes(match[1])) return match[1];
            return null;
        }
		async function handleUserMessage(username, message) {
			console.log(`[${bot.username}] Request received from ${username}: ${message}`);
			   conversation.push({ role: 'user', content: message });
			   if (saveConversation) {
				   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
			   }
			let reply = '';
			try {
				const completion = await llmClient.chat.completions.create({
					model: llmModel,
					messages: conversation,
					max_tokens: 256,
				});
				reply = completion.choices[0].message.content ? completion.choices[0].message.content.trim() : "(no content)";
			} catch (e) {
				reply = "My brain disconnected, try again.";
			}
			   conversation.push({ role: 'assistant', content: reply });
			   if (saveConversation) {
				   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
			   }
			await sendMsgToUser(username, reply);
			console.log(`[${bot.username}] Responded to ${username}: ${reply}`);

			// Check for info commands (handle multiple)
			let foundInfoCommands = [];
			const commandRegex = /!(\w+)(?:\(|\s|$)/g;
			let match;
			while ((match = commandRegex.exec(reply)) !== null) {
				console.log(`[${bot.username}] Found command: ${match[1]}`);
				if (infoCommands.includes(match[1])) {
					foundInfoCommands.push(match[1]);
					console.log(`[${bot.username}] Added info command: ${match[1]}`);
				}
			}
			
			console.log(`[${bot.username}] Total info commands found: ${foundInfoCommands.length}`);
			
			if (foundInfoCommands.length > 0) {
				// Run all info commands, append results to convo (not shown to user)
				for (const infoCmd of foundInfoCommands) {
					const infoResult = await handleInfoCommand(bot, infoCmd, username);
					if (infoResult) {
						console.log(`[${bot.username}] Info command result (${infoCmd}): ${infoResult}`);
						   conversation.push({ role: 'assistant', content: `${infoCmd}: ${infoResult}` });
						   if (saveConversation) {
							   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
						   }
					}
				}
				
				// Now, ask LLM for a final response with all the info included
				let finalReply = '';
				try {
					// Get an initial final reply
					const completion2 = await llmClient.chat.completions.create({
						model: llmModel,
						messages: conversation,
						max_tokens: 256,
					});
					finalReply = completion2.choices[0].message.content.trim();
				} catch (e) {
					finalReply = "(error getting final response)";
				}
				// If the final reply contains commands (e.g. !doThing(...)), execute them and ask the LLM again
				// Repeat up to 3 times to let the model produce a concluding, non-command response
				try {
					let attempts = 0;
					const commandTest = /!(\w+)(?:\(|\s|$)/;
					while (attempts < 3 && commandTest.test(finalReply)) {
						console.log(`[${bot.username}] Final reply contains command(s), executing: ${finalReply}`);
						// Execute any commands present in the finalReply
						parseAndExecuteCommands(bot, finalReply, username);
						// Record that we executed those commands and ask for a concluding reply
						   conversation.push({ role: 'assistant', content: `Executed commands: ${finalReply}` });
						   if (saveConversation) {
							   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
						   }
						// Request a new final reply from the LLM that should not include commands
						const completionN = await llmClient.chat.completions.create({
							model: llmModel,
							messages: conversation,
							max_tokens: 256,
						});
						finalReply = completionN.choices[0].message.content.trim();
						attempts++;
					}
				} catch (e) {
					console.error(`[${bot.username}] Error while executing commands from final reply:`, e.message || e);
				}
				console.log(`[${bot.username}] Final reply: ${finalReply}`);
				await sendMsgToUser(username, finalReply);
				   conversation.push({ role: 'assistant', content: finalReply });
				   if (saveConversation) {
					   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
				   }
			} else {
				// Parse and execute other commands (only if not an info command)
				parseAndExecuteCommands(bot, reply, username);
			}
		}

		if (bots.length === 1) {
			// Single bot: respond to global chat
			bot.on('chat', (username, message) => {
				if (username === bot.username) return;
				handleUserMessage(username, message);
			});
		} else if (bots.length === 2) {
			// Two bots: only respond to /msg <botname> <message>
			bot.on('whisper', (username, message) => {
				if (username === bot.username) return;
				console.log(`[${bot.username}] Whisper received from ${username}: ${message}`);
				handleUserMessage(username, message);
			});
		}
	}
	createBot();
}

bots.forEach(createBotForConfig);
