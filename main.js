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
const { parseAndExecuteCommands, handleQueryCommand, setMainCallbacks } = require('./agent');

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
		// Helper: send a message in the correct mode (public or msg)
		function sendBotMessage(text, opts = {}) {
			// opts: {replyMode, replyTo}
			let mode = opts.replyMode || (usePublicChat ? 'public' : 'msg');
			let to = opts.replyTo || bot.username;
			if (mode === 'msg') {
				bot.chat(`/msg ${to} ${text}`);
			} else {
				bot.chat(text);
			}
		}
		// === Idle Timeout Feature ===
		const idleTimeoutSeconds = botConfig.idle_timeout_seconds || 0;
		const idleMessage = botConfig.idle_message || "I'm bored. What should I do?";
		let idleTimer = null;

		function resetIdleTimer() {
			if (idleTimeoutSeconds <= 0) return; // Feature disabled
			if (idleTimer) clearTimeout(idleTimer);

			idleTimer = setTimeout(() => {
			console.log(`[${botConfig.username}] Idle timeout triggered.`);
			// Simulate a message from 'System' to make the bot do something.
			const systemMessage = `${idleTimeoutSeconds} seconds has passed since interacting with a user: ${idleMessage}`;

			// Determine who to "talk" to based on chat settings, prioritizing only_chat_with like in death handling.
			if (onlyChatWith && onlyChatWith.length > 0) {
				// Send private messages to users in only_chat_with list.
				for (const name of onlyChatWith) {
				handleUserMessage('System', systemMessage, { replyMode: 'msg', replyTo: name });
				}
			} else {
				// If no only_chat_with, use public chat if enabled, else send msg (but this may not be ideal if no recipient).
				handleUserMessage('System', systemMessage, { replyMode: usePublicChat ? 'public' : 'msg' });
			}

			}, idleTimeoutSeconds * 1000);
		}

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
			   }
		   });
		bot = mineflayer.createBot({
			host: config.host,
			port: config.port,
			username: botConfig.username,
			version: config.minecraft_version ? config.minecraft_version.toString() : undefined
		});

		const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
		const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = goals;
		bot.loadPlugin(pathfinder);
		let lastDeathPosition = null;
		bot.once('spawn', () => {
			const mcData = require('minecraft-data')(bot.version);
			bot.pathfinder.setMovements(new Movements(bot, mcData));
			resetIdleTimer(); // Start idle timer on spawn
		});

        bot.on('path_update', resetIdleTimer);
        bot.on('diggingCompleted', resetIdleTimer);
        bot.on('diggingAborted', resetIdleTimer);
        bot.on('attack', resetIdleTimer);


		// === Chat Mode and Filtering ===
	const allBotNames = bots.map(b => b.username);
	const onlyChatWith = Array.isArray(botConfig.only_chat_with)
		? (botConfig.only_chat_with.length === 0 ? null : botConfig.only_chat_with.map(n => n.toLowerCase()))
		: null;
	const usePublicChat = botConfig.use_public_chat !== false;

		// Helper: should we listen/respond to this username?
		function shouldListenTo(username) {
			if (allBotNames.includes(username)) return false; // ignore other bots
			if (onlyChatWith) return onlyChatWith.includes(username.toLowerCase());
			return true;
		}

		// Track last death position and auto-return after respawn (configurable)
		const autoReturnOnDeath = (typeof botConfig.auto_return_on_death === 'boolean') ? botConfig.auto_return_on_death : false;
		if (autoReturnOnDeath) {
			bot.on('death', () => {
				if (bot.entity && bot.entity.position) {
					lastDeathPosition = bot.entity.position.clone();
					console.log(`[${botConfig.username}] Died at: ` + lastDeathPosition);
					resetIdleTimer(); // Reset idle timer on death
				}
			});
			bot.on('spawn', () => {
				if (lastDeathPosition) {
					// Wait a short moment to ensure bot is ready
					setTimeout(() => {
						// Use public or private chat based on config and bot count
						if (onlyChatWith && onlyChatWith.length > 0) {
							for (const name of onlyChatWith) {
								sendBotMessage('Returning to last death position...', {replyMode: 'msg', replyTo: name});
							}
						} else {
							sendBotMessage('Returning to last death position...', {replyMode: usePublicChat ? 'public' : 'msg'});
						}
						bot.pathfinder.setGoal(new GoalNear(lastDeathPosition.x, lastDeathPosition.y, lastDeathPosition.z, 2));
						// After reaching, look for items to pick up
						const tryPickupItems = () => {
							// Find dropped item entities within radius 5 of lastDeathPosition
							const items = Object.values(bot.entities).filter(e => e.name === 'item' && e.position.distanceTo(lastDeathPosition) <= 5);
							if (items.length === 0) {
								if (onlyChatWith && onlyChatWith.length > 0) {
									for (const name of onlyChatWith) {
										sendBotMessage('No dropped items found at death location.', {replyMode: 'msg', replyTo: name});
									}
								} else {
									sendBotMessage('No dropped items found at death location.', {replyMode: usePublicChat ? 'public' : 'msg'});
								}
								return;
							}
							let idx = 0;
							const goToNextItem = () => {
								if (idx >= items.length) {
									if (onlyChatWith && onlyChatWith.length > 0) {
										for (const name of onlyChatWith) {
											sendBotMessage('Done picking up items at death location.', {replyMode: 'msg', replyTo: name});
										}
									} else {
										sendBotMessage('Done picking up items at death location.', {replyMode: usePublicChat ? 'public' : 'msg'});
									}
									return;
								}
								const item = items[idx];
								bot.pathfinder.setGoal(new GoalNear(item.position.x, item.position.y, item.position.z, 1));
								// Wait until close, then try next
								const checkArrived = setInterval(() => {
									// Guard: item or item.position may be undefined if item was picked up or despawned
									if (!item || !item.position) {
										clearInterval(checkArrived);
										setTimeout(() => {
											idx++;
											goToNextItem();
										}, 600);
										return;
									}
									if (bot.entity.position.distanceTo(item.position) < 1.5) {
										clearInterval(checkArrived);
										setTimeout(() => {
											idx++;
											goToNextItem();
										}, 600);
									}
								}, 400);
							};
							goToNextItem();
						};
						// Wait a bit for pathfinder to reach the spot, then start pickup
						setTimeout(tryPickupItems, 4000);
					}, 1500);
				}
			});
		}

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

        // === Auto Eat Feature ===
        const autoEat = (typeof botConfig.auto_eat === 'boolean') ? botConfig.auto_eat : true;
        let eatInterval = null;
        if (autoEat) {
		 bot.once('spawn', () => {
				eatInterval = setInterval(async () => {
					try {
						// Emergency: If health is very low, try to eat healing item (e.g. golden_apple)
						if (bot.health !== undefined && bot.health <= 8) { // 4 hearts or less
							if (bot.health <= 6) {
								// Say a warning message if health is 3 hearts or less
								const dyingMessages = [
									"I'm dying!",
									"I'm almost dead!",
									"I'm really low on health.",
									"Help! I'm about to die!"
								];
								const randomMsg = dyingMessages[Math.floor(Math.random() * dyingMessages.length)];
								if (onlyChatWith && onlyChatWith.length > 0) {
									for (const name of onlyChatWith) {
										sendBotMessage(randomMsg, {replyMode: 'msg', replyTo: name});
									}
								} else {
									sendBotMessage(randomMsg, {replyMode: usePublicChat ? 'public' : 'msg'});
								}
							}
							const healingItems = bot.inventory.items().filter(item =>
								item.name === 'golden_apple' || item.name === 'enchanted_golden_apple'
							);
							if (healingItems.length > 0 && !bot.isEating) {
								const healItem = healingItems[0];
								await bot.equip(healItem, 'hand');
								await bot.consume();
								console.log(`[${botConfig.username}] Ate healing item: ${healItem.name} (health: ${bot.health})`);
								return; // Don't eat normal food this tick
							}
						}
                        // Only eat if hunger is not full and not already eating
                        if (bot.food !== undefined && bot.food < 18 && !bot.isEating) {
                            // Find best food in inventory
                            const foods = bot.inventory.items().filter(item => {
                                // Exclude non-foods and rotten flesh
                                const foodEffect = bot.registry.foodsByName[item.name];
                                return foodEffect && item.name !== 'rotten_flesh';
                            });
                            if (foods.length > 0) {
                                // Pick the food with highest nutrition
                                foods.sort((a, b) => {
                                    const fa = bot.registry.foodsByName[a.name].foodPoints;
                                    const fb = bot.registry.foodsByName[b.name].foodPoints;
                                    return fb - fa;
                                });
                                const food = foods[0];
                                await bot.equip(food, 'hand');
                                await bot.consume();
                                console.log(`[${botConfig.username}] Ate ${food.name} (hunger: ${bot.food})`);
                            }
                        }
                    } catch (e) {
                        // Ignore errors (e.g. already eating)
                    }
                }, 3000);
            });
            bot.on('end', () => { if (eatInterval) clearInterval(eatInterval); });
        }
		

		bot.on('login', () => {
			reconnectAttempted = false;
			console.log(`[Bot] Logged in as ${botConfig.username}`);
			if (config.init_message) {
				sendBotMessage(config.init_message, {replyMode: usePublicChat ? 'public' : 'msg'});
			}
			

		});

		// === Auto Defense Feature ===
		const autoDefense = (typeof botConfig.auto_defense === 'boolean') ? botConfig.auto_defense : true;
		if (autoDefense) {
			let currentTarget = null;
			let attackInterval = null;

			async function equipWeapon() {
				// Try to equip sword first, then axe
				const sword = bot.inventory.items().find(item => item.name.endsWith('_sword'));
				if (sword) {
					try {
						await bot.equip(sword, 'hand');
						console.log(`[${botConfig.username}] Equipped sword: ${sword.name}`);
						return true;
					} catch (e) {
						console.log(`[${botConfig.username}] Failed to equip sword: ${e.message}`);
					}
				}
				const axe = bot.inventory.items().find(item => item.name.endsWith('_axe'));
				if (axe) {
					try {
						await bot.equip(axe, 'hand');
						console.log(`[${botConfig.username}] Equipped axe: ${axe.name}`);
						return true;
					} catch (e) {
						console.log(`[${botConfig.username}] Failed to equip axe: ${e.message}`);
					}
				}
				console.log(`[${botConfig.username}] No sword or axe available to equip.`);
				return false;
			}

			function stopAttacking() {
				if (attackInterval) {
					clearInterval(attackInterval);
					attackInterval = null;
				}
				currentTarget = null;
				bot.pathfinder.setGoal(null);
			}

			bot.on('entityGone', (entity) => {
				if (currentTarget && entity.id === currentTarget.id) {
					console.log(`[${botConfig.username}] Target is gone, stopping attack.`);
					stopAttacking();
				}
			});

			bot.on('entityHurt', (entity) => {
				// Only defend if the bot itself is hurt
				if (entity === bot.entity) {
					console.log(`[${botConfig.username}] Bot was hurt! Health: ${bot.health}`);
					resetIdleTimer(); // Reset idle timer when hurt

					// Find nearby hostile mobs (ignore players)
					const hostileNames = [
						'blaze', 'bogged', 'breeze',
						'creaking', 'creeper',
						'elder_guardian', 'ender_dragon', 'endermite', 'evoker',
						'ghast', 'guardian',
						'hoglin', 'husk',
						'illusioner',
						'magma_cube',
						'phantom', 'piglin_brute', 'pillager',
						'ravager', 'shulker', 'silverfish', 'skeleton', 'slime', 'stray',
						'vex', 'vindicator',
						'warden', 'witch', 'wither', 'wither_skeleton',
						'zoglin', 'zombie', 'zombie_villager'
					];
					// Optionally include 'player' as hostile if attack_player is true
					const attackPlayer = botConfig.attack_player === true;
					if (attackPlayer) hostileNames.push('player');
					const nearbyHostiles = Object.values(bot.entities).filter(e => {
						if (e === bot.entity) return false;
						const distance = e.position.distanceTo(bot.entity.position);
						return distance <= 8 && hostileNames.includes(e.name);
					});

					if (nearbyHostiles.length > 0) {
						// Find the closest hostile mob
						let closest = nearbyHostiles[0];
						let minDist = closest.position.distanceTo(bot.entity.position);
						for (const e of nearbyHostiles) {
							const dist = e.position.distanceTo(bot.entity.position);
							if (dist < minDist) {
								closest = e;
								minDist = dist;
							}
						}

						console.log(`[${botConfig.username}] Defending against mob: ${closest.name}`);

						// If already attacking this target, do nothing
						if (currentTarget && currentTarget.id === closest.id) return;

						stopAttacking();
						currentTarget = closest;

						// Announce fighting
						const fightMessages = [
							`Fighting ${closest.name}!`,
							`Attacking ${closest.name}!`,
							`Getting revenge on ${closest.name}!`,
							`This annoying ${closest.name} hit me.`
						];
						const fightMsg = fightMessages[Math.floor(Math.random() * fightMessages.length)];
						if (onlyChatWith && onlyChatWith.length > 0) {
							for (const name of onlyChatWith) {
								sendBotMessage(fightMsg, {replyMode: 'msg', replyTo: name});
							}
						} else {
							sendBotMessage(fightMsg, {replyMode: usePublicChat ? 'public' : 'msg'});
						}

						// Attack until mob is dead or far away
						attackInterval = setInterval(async () => {
							if (!currentTarget || !bot.entities[currentTarget.id]) {
								console.log(`[${botConfig.username}] Target is dead or gone.`);
								stopAttacking();
								return;
							}
							const dist = bot.entity.position.distanceTo(currentTarget.position);
							if (dist > 12) {
								console.log(`[${botConfig.username}] Target ran away.`);
								stopAttacking();
								return;
							}
							if (bot.health > 6) {
								bot.pathfinder.setGoal(new GoalNear(currentTarget.position.x, currentTarget.position.y, currentTarget.position.z, 1));
								if (dist <= 3) {
									await equipWeapon();
									bot.attack(currentTarget);
									console.log(`[${botConfig.username}] Attacking mob: ${currentTarget.name}`);
								}
							} else {
								// Run away if health is low
								const awayX = bot.entity.position.x + (bot.entity.position.x - currentTarget.position.x) * 2;
								const awayZ = bot.entity.position.z + (bot.entity.position.z - currentTarget.position.z) * 2;
								bot.pathfinder.setGoal(new GoalXZ(awayX, awayZ));
								console.log(`[${botConfig.username}] Running away from mob: ${currentTarget.name}`);
								stopAttacking();
							}
						}, 1000);
					} else {
						console.log(`[${botConfig.username}] Hurt but no hostile mob found nearby`);
					}
				}
			});

			bot.on('end', stopAttacking);
			}

		bot.on('error', (err) => {
			if (!reconnectAttempted) {
				console.error(`[Bot ${botConfig.username}] Error:`, err);
			}
		});

		bot.on('end', (reason) => {
			const msg = reason ? `[Bot ${botConfig.username}] Disconnected: ${reason}` : `[Bot ${botConfig.username}] Disconnected.`;
			console.log(msg);
			if (idleTimer) clearTimeout(idleTimer); // Stop idle timer on disconnect
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

		// Query commands to handle specially
		const queryCommands = ['stats', 'inventory', 'nearbyBlocks', 'entities', 'savedPlaces', 'viewChest'];

		async function handleUserMessage(username, message) {
			resetIdleTimer(); // Any user message is activity
			console.log(`[${bot.username}] Request received from ${username}: ${message}`);
			   conversation.push({ role: 'user', content: `${username}: ${message}` });
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
			// Determine reply mode (public or msg)
			let replyMode = 'public';
			let replyTo = username;
			if (arguments.length > 2 && arguments[2]) {
				if (arguments[2].replyMode === 'msg') replyMode = 'msg';
				if (arguments[2].replyTo) replyTo = arguments[2].replyTo;
			}
			if (replyMode === 'msg') {
				await sendMsgToUser(replyTo, reply);
			} else {
				sendBotMessage(reply, {replyMode: 'public'});
			}
		console.log(`[${bot.username}] Responded to ${username} (${replyMode}): ${reply}`);

			// Check for query commands (handle multiple)
			let foundQueryCommands = [];
			const commandRegex = /!(\w+)(?:\(|\s|$)/g;
			let match;
			while ((match = commandRegex.exec(reply)) !== null) {
				console.log(`[${bot.username}] Found command: ${match[1]}`);
				if (queryCommands.includes(match[1])) {
					foundQueryCommands.push(match[1]);
					console.log(`[${bot.username}] Added query command: ${match[1]}`);
				}
			}
			
			console.log(`[${bot.username}] Total query commands found: ${foundQueryCommands.length}`);
			
			if (foundQueryCommands.length > 0) {
				// Run all query commands, append results to convo (not shown to user)
				for (const queryCmd of foundQueryCommands) {
					const queryResult = await handleQueryCommand(bot, queryCmd, username);
					if (queryResult) {
						console.log(`[${bot.username}] Query command result (${queryCmd}): ${queryResult}`);
						   conversation.push({ role: 'assistant', content: `${queryCmd}: ${queryResult}` });
						   if (saveConversation) {
							   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
						   }
					}
				}
				
				// Now, ask LLM for a final response with all the query results included
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
				if (replyMode === 'msg') {
					await sendMsgToUser(username, finalReply);
				} else {
					sendBotMessage(finalReply, {replyMode: 'public'});
				}
				   conversation.push({ role: 'assistant', content: finalReply });
				   if (saveConversation) {
					   try { fs.writeFileSync(conversationFile, JSON.stringify(conversation, null, 2)); } catch (e) {}
				   }
			} else {
				// Parse and execute other commands (only if not a query command)
				parseAndExecuteCommands(bot, reply, username);
			}
		}

		// --- Chat event handling ---
		// Always listen for /msg (whisper)
		bot.on('whisper', (username, message) => {
			if (username === bot.username) return;
			if (!shouldListenTo(username)) return;
			handleUserMessage(username, message, {replyMode: 'msg', replyTo: username});
		});

		// Listen to public chat if allowed
	if (usePublicChat) {
			bot.on('chat', (username, message) => {
				if (username === bot.username) return;
				if (!shouldListenTo(username)) return;
				// Ignore other bots
				if (allBotNames.includes(username)) return;
				// If only one bot, always respond in public chat unless message was a /msg
				// If multiple bots, ignore other bots and respond in public chat
				handleUserMessage(username, message, {replyMode: 'public'});
			});
		}
	}
	createBot();
}

bots.forEach(createBotForConfig);
