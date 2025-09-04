// agent.js - Command parsing and execution
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = goals;

async function handleQueryCommand(bot, command, username) {
	switch (command) {
	       case 'stats': {
			const pos = bot.entity.position;
			const health = bot.health;
			const maxHealth = 20;
			const food = bot.food;
			const maxFood = 20;
			const timeOfDay = bot.time.timeOfDay;
			let timeDescription = 'Unknown';
			if (timeOfDay >= 0 && timeOfDay < 1000) timeDescription = 'Dawn';
			else if (timeOfDay >= 1000 && timeOfDay < 6000) timeDescription = 'Morning';
			else if (timeOfDay >= 6000 && timeOfDay < 9000) timeDescription = 'Noon';
			else if (timeOfDay >= 9000 && timeOfDay < 12000) timeDescription = 'Afternoon';
			else if (timeOfDay >= 12000 && timeOfDay < 13000) timeDescription = 'Dusk';
			else if (timeOfDay >= 13000 && timeOfDay < 18000) timeDescription = 'Evening';
			else if (timeOfDay >= 18000 && timeOfDay < 22000) timeDescription = 'Night';
			else if (timeOfDay >= 22000 || timeOfDay < 0) timeDescription = 'Midnight';
			const experience = bot.experience ? bot.experience.level : 0;
			const effects = Object.keys(bot.entity.effects).length > 0 ? Object.keys(bot.entity.effects).join(', ') : 'None';
			const gamemode = bot.game.gameMode;
			const dimension = bot.game.dimension;
			return `Location: ${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)} | Health: ${health}/${maxHealth} | Hunger: ${food}/${maxFood} | Time: ${timeDescription} (${timeOfDay}) | Experience Level: ${experience} | Active Effects: ${effects} | Gamemode: ${gamemode} | Dimension: ${dimension}. Since user cannot see this message, in my next response I will give an overview of this.`;
	       }
		case 'inventory': {
			const items = bot.inventory.items().map(i => `${i.name} x${i.count}`);
			const armor = [];
			if (bot.inventory.slots[5]) armor.push(`Helmet: ${bot.inventory.slots[5].name}`);
			if (bot.inventory.slots[6]) armor.push(`Chestplate: ${bot.inventory.slots[6].name}`);
			if (bot.inventory.slots[7]) armor.push(`Leggings: ${bot.inventory.slots[7].name}`);
			if (bot.inventory.slots[8]) armor.push(`Boots: ${bot.inventory.slots[8].name}`);
			if (bot.inventory.slots[45]) armor.push(`Off-hand: ${bot.inventory.slots[45].name}`);
			const armorStr = armor.length ? ' | Equipped: ' + armor.join(', ') : '';
			const inventoryStr = items.length ? items.join(', ') : 'Empty';
			return inventoryStr + armorStr + '. Since user cannot see this message, in my next response I will give an overview of this.';
		}
		case 'nearbyBlocks': {
			const pos = bot.entity.position;
			const blocks = [];
			for (let dx = -3; dx <= 3; dx++) {
				for (let dy = -2; dy <= 2; dy++) {
					for (let dz = -3; dz <= 3; dz++) {
						const block = bot.blockAt(pos.offset(dx, dy, dz));
						if (block && !blocks.includes(block.name)) blocks.push(block.name);
					}
				}
			}
			return blocks.length ? blocks.join(', ') + '. Since user cannot see this message, in my next response I will give an overview of this.' : 'None nearby';
		}
		case 'entities': {
			const entities = Object.values(bot.entities)
				.filter(e => e.username && e.username !== bot.username)
				.map(e => e.username);
			return entities.length ? entities.join(', ') + '. Since user cannot see this message, in my next response I will give an overview of this.' : 'No players nearby';
		}
		case 'savedPlaces': {
			const state = getBotState(bot.username);
			const places = Object.keys(state.savedPlaces);
			if (places.length > 0) {
				return places.map(name => {
					const place = state.savedPlaces[name];
					return `${name}: ${place.x.toFixed(1)}, ${place.y.toFixed(1)}, ${place.z.toFixed(1)}`;
				}).join(' | ')  + '. Since user cannot see this message, in my next response I will give an overview of this.';
			} else {
				return 'No saved places';
			}
		}
		case 'viewChest': {
			const chestBlock = bot.findBlock({
				matching: (block) => block.name === 'chest' || block.name === 'trapped_chest',
				maxDistance: 6
			});
			if (!chestBlock) return 'No chest found nearby';
			try {
				const chest = await bot.openChest(chestBlock);
				const items = chest.containerItems().map(i => `${i.name} x${i.count}`);
				await chest.close();
				return items.length ? items.join(', ') + '. Since user cannot see this message, in my next response I will give an overview of this.' : 'Empty chest';
			} catch (e) {
				return 'Cannot access chest';
			}
		}
		default:
			return null;
	}
}

const botStates = new Map();

function getBotState(botUsername) {
	if (!botStates.has(botUsername)) {
		botStates.set(botUsername, {
			savedPlaces: {},
			following: null,
			followInterval: null
		});
	}
	return botStates.get(botUsername);
}

let mainCallbacks = {};
function setMainCallbacks(callbackObj) {
    mainCallbacks = callbackObj;
}
function parseAndExecuteCommands(bot, message, username) {
	// Find all !command(params) or !command in the message
	const commandRegex = /!(\w+)(?:\(([^)]*)\))?/g;
	let match;
	while ((match = commandRegex.exec(message)) !== null) {
		const command = match[1];
		let params = [];
		if (match[2]) {
			// Parse params: support quoted strings and numbers
			const paramString = match[2];
			const paramRegex = /\s*("([^"]*)"|'([^']*)'|[^,]+)\s*(?:,|$)/g;
			let paramMatch;
			while ((paramMatch = paramRegex.exec(paramString)) !== null) {
				let val = paramMatch[2] !== undefined ? paramMatch[2]
					: (paramMatch[3] !== undefined ? paramMatch[3] : paramMatch[1]);
				// Try to parse as number if not quoted
				if (paramMatch[2] === undefined && paramMatch[3] === undefined) {
					const num = Number(val);
					if (!isNaN(num)) val = num;
					else val = val.trim();
				}
				params.push(val);
			}
		}
		executeCommand(bot, command, params, username);
	}
}

function executeCommand(bot, command, params, username) {
	const state = getBotState(bot.username);
	
	if (!bot.pathfinder) {
		bot.loadPlugin(pathfinder);
		const mcData = require('minecraft-data')(bot.version);
		bot.pathfinder.setMovements(new Movements(bot, mcData));
	}
	
	switch (command) {
		case 'help':
			console.log(`[${bot.username}] Showing help to ${username}`);
			bot.chat(`/msg ${username} Available commands: !help, !stop, !restart, !clearChat, !goToPlayer(player,distance), !followPlayer(player,distance), !goToCoordinates(x,y,z,distance), !searchForBlock(block,distance), !searchForEntity(entity,distance), !moveAway(distance), !rememberHere(name), !savedPlaces, !goToRememberedPlace(name), !givePlayer(player,item,amount), !consume(item), !equip(item), !putInChest(item,amount), !takeFromChest(item,amount), !discard(item,amount), !collectBlocks(block,amount), !craftRecipe(item,amount), !smeltItem(item,amount), !clearFurnace, !placeHere(item), !attack(entity), !attackPlayer(player), !goToBed, !activate(block), !stay(seconds), !startConversation(player,message), !digDown(distance). Query commands: !stats, !inventory, !nearbyBlocks, !entities, !viewChest`);
			break;
			
		case 'stop':
			console.log(`[${bot.username}] Stopping all actions`);
			bot.pathfinder?.stop();
			if (state.followInterval) {
				clearInterval(state.followInterval);
				state.followInterval = null;
			}
			state.following = null;
			break;
			
		case 'restart':
			console.log(`[${bot.username}] Leaving/disconnecting...`);
			if (mainCallbacks && typeof mainCallbacks.restart === 'function') {
				mainCallbacks.restart();
			}
			break;

		case 'clearChat':
			console.log(`[${bot.username}] Clearing chat history`);
			if (mainCallbacks && typeof mainCallbacks.clearChat === 'function') {
				mainCallbacks.clearChat();
			}
			break;
			
		case 'goToPlayer': {
			const targetPlayer = bot.players[params[0]];
			if (targetPlayer && targetPlayer.entity) {
				const closeness = parseInt(params[1]) || 2;
				const msg = `Going to player: ${params[0]} (distance: ${closeness})`;
				console.log(`[${bot.username}] ${msg}`);
				bot.pathfinder.setGoal(new GoalNear(targetPlayer.entity.position.x, targetPlayer.entity.position.y, targetPlayer.entity.position.z, closeness));
			} else {
				const msg = `Player ${params[0]} not found.`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'followPlayer': {
			const followPlayer = bot.players[params[0]];
			if (followPlayer && followPlayer.entity) {
				const followDist = parseInt(params[1]) || 3;
				state.following = params[0];
				const msg = `Following player: ${params[0]} at distance: ${followDist}`;
				console.log(`[${bot.username}] ${msg}`);
				// Clear existing follow interval
				if (state.followInterval) clearInterval(state.followInterval);
				// Follow logic
				state.followInterval = setInterval(() => {
					const player = bot.players[state.following];
					if (player && player.entity) {
						const dist = bot.entity.position.distanceTo(player.entity.position);
						if (dist > followDist) {
							bot.pathfinder.setGoal(new GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, followDist));
						}
					}
				}, 1000);
			} else {
				const msg = `Player ${params[0]} not found.`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'goToCoordinates': {
			const x = parseFloat(params[0]);
			const y = parseFloat(params[1]);
			const z = parseFloat(params[2]);
			const closeness2 = parseInt(params[3]) || 1;
			const msg = `Going to coordinates: ${x}, ${y}, ${z}`;
			console.log(`[${bot.username}] ${msg}`);
			bot.pathfinder.setGoal(new GoalNear(x, y, z, closeness2));
			break;
		}
			
		case 'searchForBlock': {
			const blockType = params[0];
			const searchRange = parseInt(params[1]) || 16;
			const msg = `Searching for block: ${blockType} in range: ${searchRange}`;
			console.log(`[${bot.username}] ${msg}`);
			const mcData = require('minecraft-data')(bot.version);
			const blockId = mcData.blocksByName[blockType]?.id;
			if (blockId) {
				const block = bot.findBlock({
					matching: blockId,
					maxDistance: searchRange
				});
				if (block) {
					const foundMsg = `Found ${blockType} at ${block.position}`;
					console.log(`[${bot.username}] ${foundMsg}`);
					bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z));
				} else {
					const notFoundMsg = `No ${blockType} found within ${searchRange} blocks`;
					console.log(`[${bot.username}] ${notFoundMsg}`);
				}
			} else {
				const unknownMsg = `Unknown block type: ${blockType}`;
				console.log(`[${bot.username}] ${unknownMsg}`);
			}
			break;
		}
			
		case 'searchForEntity': {
			const entityType = params[0];
			const entityRange = parseInt(params[1]) || 16;
			const msg = `Searching for entity: ${entityType} in range: ${entityRange}`;
			console.log(`[${bot.username}] ${msg}`);
			const entity = Object.values(bot.entities).find(e => 
				e.name === entityType && 
				e.position.distanceTo(bot.entity.position) <= entityRange
			);
			if (entity) {
				const foundMsg = `Found ${entityType} at ${entity.position}`;
				console.log(`[${bot.username}] ${foundMsg}`);
				bot.pathfinder.setGoal(new GoalNear(entity.position.x, entity.position.y, entity.position.z, 2));
			} else {
				const notFoundMsg = `No ${entityType} found within ${entityRange} blocks`;
				console.log(`[${bot.username}] ${notFoundMsg}`);
			}
			break;
		}
			
		case 'moveAway': {
			const distance = parseInt(params[0]) || 5;
			const msg = `Moving away distance: ${distance}`;
			console.log(`[${bot.username}] ${msg}`);
			const currentPos = bot.entity.position;
			const angle = Math.random() * Math.PI * 2;
			const newX = currentPos.x + Math.cos(angle) * distance;
			const newZ = currentPos.z + Math.sin(angle) * distance;
			bot.pathfinder.setGoal(new GoalXZ(newX, newZ));
			break;
		}
			
		case 'rememberHere': {
			const pos = bot.entity.position;
			state.savedPlaces[params[0]] = { x: pos.x, y: pos.y, z: pos.z };
			const msg = `Saved location "${params[0]}" at ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
			console.log(`[${bot.username}] ${msg}`);
			break;
		}
			
		case 'savedPlaces': {
			const places = Object.keys(state.savedPlaces);
			if (places.length > 0) {
				const placesList = places.map(name => {
					const place = state.savedPlaces[name];
					return `${name}: ${place.x.toFixed(1)}, ${place.y.toFixed(1)}, ${place.z.toFixed(1)}`;
				}).join(' | ');
				const msg = `Saved places: ${placesList}`;
				console.log(`[${bot.username}] ${msg}`);
			} else {
				const msg = `No saved places.`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'goToRememberedPlace': {
			const place = state.savedPlaces[params[0]];
			if (place) {
				const msg = `Going to remembered place: ${params[0]} at ${place.x}, ${place.y}, ${place.z}`;
				console.log(`[${bot.username}] ${msg}`);
				bot.pathfinder.setGoal(new GoalNear(place.x, place.y, place.z, 1));
			} else {
				const msg = `No saved place named: ${params[0]}`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'givePlayer': {
			const giveTarget = bot.players[params[0]];
			if (giveTarget && giveTarget.entity) {
				const itemName = params[1];
				if (itemName === '*' || itemName === 'all') {
					// Give entire inventory
					const items = bot.inventory.items();
					if (items.length === 0) {
						const msg = `Inventory is empty`;
						console.log(`[${bot.username}] ${msg}`);
					} else {
						const msg = `Giving entire inventory to ${params[0]} (${items.length} items)`;
						console.log(`[${bot.username}] ${msg}`);
						// Move close to player first
						bot.pathfinder.setGoal(new GoalNear(giveTarget.entity.position.x, giveTarget.entity.position.y, giveTarget.entity.position.z, 2));
						bot.pathfinder.setGoal(null, true);
						setTimeout(() => {
							for (const item of items) {
								bot.toss(item.type, null, item.count).catch(err => {
									const failMsg = `Failed to give ${item.name}: ${err.message}`;
									console.log(`[${bot.username}] ${failMsg}`);
								});
							}
						}, 2000);
					}
				} else {
					const amount = parseInt(params[2]) || 1;
					const item = bot.inventory.items().find(i => i.name === itemName);
					if (item && item.count >= amount) {
						const msg = `Giving ${amount} ${itemName} to ${params[0]}`;
						console.log(`[${bot.username}] ${msg}`);
						// Move close to player first
						bot.pathfinder.setGoal(new GoalNear(giveTarget.entity.position.x, giveTarget.entity.position.y, giveTarget.entity.position.z, 2));
						bot.pathfinder.setGoal(null, true);
						setTimeout(async () => {
							try {
								await bot.toss(item.type, null, amount);
								const tossMsg = `Tossed ${amount} ${itemName}`;
								console.log(`[${bot.username}] ${tossMsg}`);
							} catch (err) {
								const failMsg = `Failed to give item: ${err.message}`;
								console.log(`[${bot.username}] ${failMsg}`);
							}
						}, 2000);
					} else {
						const msg = `Don't have enough ${itemName} (need ${amount}, have ${item?.count || 0})`;
						console.log(`[${bot.username}] ${msg}`);
					}
				}
			} else {
				const msg = `Player ${params[0]} not found`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'consume': {
			const consumeItem = bot.inventory.items().find(i => i.name === params[0]);
			if (consumeItem) {
				const msg = `Consuming: ${params[0]}`;
				console.log(`[${bot.username}] ${msg}`);
				bot.equip(consumeItem, 'hand').then(() => {
					bot.consume();
				}).catch(err => {
					const failMsg = `Failed to consume ${params[0]}: ${err.message}`;
					console.log(`[${bot.username}] ${failMsg}`);
				});
			} else {
				const msg = `Don't have ${params[0]} to consume`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}

		case 'equip': {
			if (params[0] === '*' || params[0] === 'all') {
				const items = bot.inventory.items();
				if (items.length === 0) {
					const msg = `Inventory is empty`;
					console.log(`[${bot.username}] ${msg}`);
				} else {
					const msg = `Equipping all items in inventory (${items.length} items)`;
					console.log(`[${bot.username}] ${msg}`);
					const equipNext = (idx = 0) => {
						if (idx >= items.length) return;
						const equipItem = items[idx];
						const name = equipItem.name;
						let dest = 'hand';
						if (name.includes('helmet') || name.includes('head')) dest = 'head';
						else if (name.includes('chestplate')) dest = 'torso';
						else if (name.includes('leggings')) dest = 'legs';
						else if (name.includes('boots')) dest = 'feet';
						bot.equip(equipItem, dest).catch(err => {
							const failMsg = `Failed to equip ${equipItem.name}: ${err.message}`;
							console.log(`[${bot.username}] ${failMsg}`);
						}).finally(() => {
							setTimeout(() => equipNext(idx + 1), 300);
						});
					};
					equipNext();
				}
			} else {
				const equipItem = bot.inventory.items().find(i => i.name === params[0]);
				if (equipItem) {
					const msg = `Equipping: ${params[0]}`;
					console.log(`[${bot.username}] ${msg}`);
					const name = equipItem.name;
					let dest = 'hand';
					if (name.includes('helmet') || name.includes('head')) dest = 'head';
					else if (name.includes('chestplate')) dest = 'torso';
					else if (name.includes('leggings')) dest = 'legs';
					else if (name.includes('boots')) dest = 'feet';
					bot.equip(equipItem, dest).then(() => {
						const doneMsg = `Equipped ${params[0]} in ${dest}`;
						console.log(`[${bot.username}] ${doneMsg}`);
					}).catch(err => {
						const failMsg = `Failed to equip ${params[0]}: ${err.message}`;
						console.log(`[${bot.username}] ${failMsg}`);
					});
				} else {
					const msg = `Don't have ${params[0]} to equip`;
					console.log(`[${bot.username}] ${msg}`);
				}
			}
			break;
		}

		case 'putInChest': {
			const chestBlock = bot.findBlock({
				matching: (block) => block.name === 'chest' || block.name === 'trapped_chest',
				maxDistance: 6
			});
			if (chestBlock) {
				if (params[0] === '*' || params[0] === 'all') {
					// Put entire inventory in chest
					const items = bot.inventory.items();
					if (items.length === 0) {
						const msg = `Inventory is empty`;
						console.log(`[${bot.username}] ${msg}`);
					} else {
						const msg = `Putting entire inventory in chest (${items.length} items)`;
						console.log(`[${bot.username}] ${msg}`);
						bot.openChest(chestBlock).then(chest => {
							let depositedCount = 0;
							const depositNext = () => {
								if (depositedCount >= items.length) {
									const doneMsg = `Put entire inventory in chest`;
									console.log(`[${bot.username}] ${doneMsg}`);
									chest.close();
									return;
								}
								const item = items[depositedCount];
								chest.deposit(item.type, null, item.count).then(() => {
									depositedCount++;
									setTimeout(depositNext, 100); // Small delay between deposits
								}).catch(err => {
									const failMsg = `Failed to put ${item.name} in chest: ${err.message}`;
									console.log(`[${bot.username}] ${failMsg}`);
									depositedCount++;
									setTimeout(depositNext, 100);
								});
							};
							depositNext();
						}).catch(err => {
							const failMsg = `Failed to open chest: ${err.message}`;
							console.log(`[${bot.username}] ${failMsg}`);
						});
					}
				} else {
					const msg = `Putting ${params[1]} ${params[0]} in chest`;
					console.log(`[${bot.username}] ${msg}`);
					const putItem = bot.inventory.items().find(i => i.name === params[0]);
					const putAmount = parseInt(params[1]) || 1;
					if (putItem && putItem.count >= putAmount) {
						bot.openChest(chestBlock).then(chest => {
							chest.deposit(putItem.type, null, putAmount).then(() => {
								const doneMsg = `Put ${putAmount} ${params[0]} in chest`;
								console.log(`[${bot.username}] ${doneMsg}`);
								chest.close();
							}).catch(err => {
								const failMsg = `Failed to put item in chest: ${err.message}`;
								console.log(`[${bot.username}] ${failMsg}`);
								chest.close();
							});
						}).catch(err => {
							const failMsg = `Failed to open chest: ${err.message}`;
							console.log(`[${bot.username}] ${failMsg}`);
						});
					} else {
						const failMsg = `Don't have enough ${params[0]}`;
						console.log(`[${bot.username}] ${failMsg}`);
					}
				}
			} else {
				const failMsg = `No chest found nearby`;
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
			
		case 'takeFromChest': {
			// Support batch takeFromChest by queueing withdrawals
			if (!bot._takeFromChestQueue) bot._takeFromChestQueue = [];
			bot._takeFromChestQueue.push({ params, username });
			if (bot._takeFromChestActive) break;
			bot._takeFromChestActive = true;
			const processQueue = async () => {
				while (bot._takeFromChestQueue.length > 0) {
					const { params, username } = bot._takeFromChestQueue.shift();
					const takeChestBlock = bot.findBlock({
						matching: (block) => block.name === 'chest' || block.name === 'trapped_chest',
						maxDistance: 6
					});
					if (takeChestBlock) {
						try {
							const chest = await bot.openChest(takeChestBlock);
							if (params[0] === '*' || params[0] === 'all') {
								// Take all items from chest
								const chestItems = chest.items();
								if (chestItems.length === 0) {
									const msg = `Chest is empty`;
									console.log(`[${bot.username}] ${msg}`);
								} else {
									const msg = `Taking all items from chest (${chestItems.length} types)`;
									console.log(`[${bot.username}] ${msg}`);
									let withdrawnCount = 0;
									const withdrawNext = () => {
										if (withdrawnCount >= chestItems.length) {
											const doneMsg = `Took all items from chest`;
											console.log(`[${bot.username}] ${doneMsg}`);
											chest.close();
											return;
										}
										const item = chestItems[withdrawnCount];
										const mcData2 = require('minecraft-data')(bot.version);
										const itemName = mcData2.items[item.type]?.name || `item_${item.type}`;
										chest.withdraw(item.type, null, item.count).then(() => {
											withdrawnCount++;
											setTimeout(withdrawNext, 100); // Small delay between withdrawals
										}).catch(err => {
											const failMsg = `Failed to take ${itemName} from chest: ${err.message}`;
											console.log(`[${bot.username}] ${failMsg}`);
											withdrawnCount++;
											setTimeout(withdrawNext, 100);
										});
									};
									withdrawNext();
								}
							} else {
								const msg = `Taking ${params[1]} ${params[0]} from chest`;
								console.log(`[${bot.username}] ${msg}`);
								const takeAmount = parseInt(params[1]) || 1;
								const mcData2 = require('minecraft-data')(bot.version);
								const itemType = mcData2.itemsByName[params[0]]?.id;
								if (itemType) {
									try {
										await chest.withdraw(itemType, null, takeAmount);
										const doneMsg = `Took ${takeAmount} ${params[0]} from chest`;
										console.log(`[${bot.username}] ${doneMsg}`);
									} catch (err) {
										const failMsg = `Failed to take item from chest: ${err.message}`;
										console.log(`[${bot.username}] ${failMsg}`);
									}
								} else {
									const failMsg = `Unknown item: ${params[0]}`;
									console.log(`[${bot.username}] ${failMsg}`);
								}
								chest.close();
							}
						} catch (err) {
							const failMsg = `Failed to open chest: ${err.message}`;
							console.log(`[${bot.username}] ${failMsg}`);
						}
					} else {
						const failMsg = `No chest found nearby`;
						console.log(`[${bot.username}] ${failMsg}`);
					}
				}
				bot._takeFromChestActive = false;
			};
			processQueue();
			break;
		}
			
		case 'discard': {
			if (params[0] === '*' || params[0] === 'all') {
				// Discard entire inventory
				const items = bot.inventory.items();
				if (items.length === 0) {
					const msg = `Inventory is empty`;
					console.log(`[${bot.username}] ${msg}`);
				} else {
					const msg = `Discarding entire inventory (${items.length} items)`;
					console.log(`[${bot.username}] ${msg}`);
					for (const item of items) {
						bot.toss(item.type, null, item.count).catch(err => {
							const failMsg = `Failed to discard ${item.name}: ${err.message}`;
							console.log(`[${bot.username}] ${failMsg}`);
						});
					}
				}
			} else {
				const discardItem = bot.inventory.items().find(i => i.name === params[0]);
				const discardAmount = parseInt(params[1]) || 1;
				if (discardItem && discardItem.count >= discardAmount) {
					const msg = `Discarding ${discardAmount} ${params[0]}`;
					console.log(`[${bot.username}] ${msg}`);
					bot.toss(discardItem.type, null, discardAmount).catch(err => {
						const failMsg = `Failed to discard ${params[0]}: ${err.message}`;
						console.log(`[${bot.username}] ${failMsg}`);
					});
				} else {
					const msg = `Don't have enough ${params[0]} to discard`;
					console.log(`[${bot.username}] ${msg}`);
				}
			}
			break;
		}
			
		case 'collectBlocks': {
			const collectType = params[0];
			const collectNum = parseInt(params[1]) || 1;
			const msg = `Collecting ${collectNum} ${collectType} blocks`;
			console.log(`[${bot.username}] ${msg}`);
			const mcData3 = require('minecraft-data')(bot.version);
			const collectBlockId = mcData3.blocksByName[collectType]?.id;
			if (collectBlockId) {
				let collected = 0;
				const collectNext = () => {
					if (collected >= collectNum) {
						const doneMsg = `Finished collecting ${collected} ${collectType}`;
						console.log(`[${bot.username}] ${doneMsg}`);
						return;
					}
					const collectBlock = bot.findBlock({
						matching: collectBlockId,
						maxDistance: 32
					});
					if (collectBlock) {
						bot.pathfinder.setGoal(new GoalBlock(collectBlock.position.x, collectBlock.position.y, collectBlock.position.z));
						bot.once('goal_reached', () => {
							bot.dig(collectBlock).then(() => {
								collected++;
								setTimeout(collectNext, 1000);
							}).catch(err => {
								const failMsg = `Failed to collect ${collectType}: ${err.message}`;
								console.log(`[${bot.username}] ${failMsg}`);
							});
						});
					} else {
						const failMsg = `No more ${collectType} blocks found nearby`;
						console.log(`[${bot.username}] ${failMsg}`);
					}
				};
				collectNext();
			} else {
				const failMsg = `Unknown block type: ${collectType}`;
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
			
		case 'craftRecipe': {
			const itemName = params[0];
			const craftAmount = parseInt(params[1]) || 1;
			if (!itemName) {
				const msg = `No item specified for crafting`;
				console.log(`[${bot.username}] ${msg}`);
				break;
			}
			const msg = `Attempting to craft ${craftAmount} ${itemName}`;
			console.log(`[${bot.username}] ${msg}`);
			try {
				const mcDataLocal = require('minecraft-data')(bot.version);
				const itemId = mcDataLocal.itemsByName[itemName]?.id;
				if (!itemId) {
					const failMsg = `Unknown item: ${itemName}`;
					console.log(`[${bot.username}] ${failMsg}`);
					break;
				}
				// Try many possible signatures for bot.recipesFor (different mineflayer versions have different signatures)
				let recipes = [];
				const attempts = [];
				try {
					// Common variants to try
					const candidates = [
						[itemId],
						[itemId, null],
						[itemId, null, null],
						[itemId, null, 1],
						[itemId, null, true],
						[itemId, undefined, craftAmount],
						[itemId, null, craftAmount],
						[itemId, null, craftAmount, null],
						[itemId, null, craftAmount, true]
					];
					for (const args of candidates) {
						let res = null;
						try {
							res = bot.recipesFor.apply(bot, args);
						} catch (e) {
							// ignore
						}
						attempts.push({ args, length: Array.isArray(res) ? res.length : (res ? 1 : 0) });
						if (res && res.length) { recipes = res; break; }
					}
				} catch (e) {
					// ignore
				}
				if (!recipes || recipes.length === 0) {
					let failMsg = `No recipe found to craft ${itemName}`;
					// Fallback to mcData to give diagnostic info
					let foundInMcData = [];
					if (mcDataLocal.recipesByResult && mcDataLocal.recipesByResult[itemId]) {
						foundInMcData = mcDataLocal.recipesByResult[itemId];
					} else if (mcDataLocal.recipes) {
						foundInMcData = mcDataLocal.recipes.filter(r => r.result && r.result.id === itemId);
					}
					console.log(`[${bot.username}] recipe lookup attempts: ${JSON.stringify(attempts.map(a=>({args:a.args,length:a.length})))}`);
					if (foundInMcData && foundInMcData.length > 0) {
						failMsg = `Found recipe data in minecraft-data but bot.recipesFor returned none. Recipe count: ${foundInMcData.length}.`;
					}
					console.log(`[${bot.username}] ${failMsg}`);
					break;
				}
				// Prefer non-table recipes
				let chosen = recipes.find(r => !(r.requiresTable || r.requiresWorkbench)) || recipes[0];
				let tableBlock = null;
				if (chosen.requiresTable || chosen.requiresWorkbench) {
					tableBlock = bot.findBlock({ matching: (b) => b.name === 'crafting_table', maxDistance: 6 });
					if (!tableBlock) {
						console.log(`[${bot.username}] Recipe requires a crafting table but none found nearby`);
						// we could try crafting or placing a table here; bail for now
						break;
					}
				}

				// Helper: inventory counts by item id
				const inventoryCountsById = () => {
					const counts = {};
					bot.inventory.items().forEach(i => {
						counts[i.type] = (counts[i.type] || 0) + i.count;
					});
					return counts;
				};

				// Helper: extract required ingredients from a recipe (best-effort for common formats)
				const ingredientsFromRecipe = (recipe) => {
					const map = {};
					if (!recipe) return [];
					if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
						for (const ing of recipe.ingredients) {
							if (!ing) continue;
							if (Array.isArray(ing)) {
								// choice array - count first choice
								const choice = ing[0];
								const id = choice.id ?? choice.type;
								const count = choice.count || 1;
								if (id) map[id] = (map[id] || 0) + count;
							} else if (typeof ing === 'object') {
								const id = ing.id ?? ing.type;
								const count = ing.count || 1;
								if (id) map[id] = (map[id] || 0) + count;
							} else if (typeof ing === 'number') {
								map[ing] = (map[ing] || 0) + 1;
							}
						}
					} else if (recipe.requires && typeof recipe.requires === 'object') {
						// some formats put ingredient counts into a requires map
						for (const k of Object.keys(recipe.requires)) {
							const entry = recipe.requires[k];
							if (entry && entry.id) map[entry.id] = (map[entry.id] || 0) + (entry.count || 1);
						}
					}
					return Object.entries(map).map(([id, count]) => ({ id: parseInt(id, 10), count }));
				};

				const calculateLimitingResource = (invCounts, reqs) => {
					let num = Infinity;
					let limiting = null;
					for (const { id, count } of reqs) {
						const have = invCounts[id] || 0;
						const possible = Math.floor(have / count);
						if (possible < num) { num = possible; limiting = id; }
					}
					if (num === Infinity) num = 0;
					return { num, limitingResource: limiting };
				};

				const reqs = ingredientsFromRecipe(chosen);
				const inv = inventoryCountsById();
				const craftLimit = calculateLimitingResource(inv, reqs);
				if (craftLimit.num <= 0 && reqs.length > 0) {
					const missing = reqs.map(r => `${(mcDataLocal.items[r.id]?.name)||r.id}: need ${r.count}, have ${inv[r.id]||0}`).join(', ');
					const failMsg = `You do not have the resources to craft ${itemName}. Missing: ${missing}`;
					console.log(`[${bot.username}] ${failMsg}`);
					break;
				}

				const toCraft = Math.min(craftAmount, craftLimit.num || craftAmount);
				if (toCraft <= 0) {
					const failMsg = `Nothing to craft for ${itemName}`;
					console.log(`[${bot.username}] ${failMsg}`);
					break;
				}

				// Attempt craft
				bot.craft(chosen, toCraft, tableBlock).then(() => {
					const doneMsg = `Successfully crafted ${toCraft} ${itemName}`;
					console.log(`[${bot.username}] ${doneMsg}`);
				}).catch(err => {
					const failMsg = `Failed to craft ${itemName}: ${err.message}`;
					console.log(`[${bot.username}] ${failMsg}`);
				});
			} catch (err) {
				const failMsg = `Crafting error for ${itemName}: ${err.message}`;
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
    
		case 'smeltItem': {
			const smeltItem = params[0];
			const smeltNum = parseInt(params[1]) || 1;
			const msg = `Smelting ${smeltNum} ${smeltItem}`;
			console.log(`[${bot.username}] ${msg}`);
			const furnace = bot.findBlock({
				matching: (block) => block.name === 'furnace' || block.name === 'blast_furnace',
				maxDistance: 6
			});
			if (furnace) {
				const inputItem = bot.inventory.items().find(i => i.name === smeltItem);
				if (inputItem && inputItem.count >= smeltNum) {
					bot.openFurnace(furnace).then(furnaceWindow => {
						// Put item in input slot
						furnaceWindow.putInput(inputItem.type, null, smeltNum).then(() => {
							// Try to add fuel (coal, charcoal, etc.)
							const fuel = bot.inventory.items().find(i => ['coal', 'charcoal', 'coal_block'].includes(i.name));
							if (fuel) {
								furnaceWindow.putFuel(fuel.type, null, 1).then(() => {
									const doneMsg = `Started smelting ${smeltNum} ${smeltItem}`;
									console.log(`[${bot.username}] ${doneMsg}`);
									furnaceWindow.close();
								}).catch(err => {
									const failMsg = `Failed to add fuel: ${err.message}`;
									console.log(`[${bot.username}] ${failMsg}`);
									furnaceWindow.close();
								});
							} else {
								const failMsg = `No fuel available for smelting`;
								console.log(`[${bot.username}] ${failMsg}`);
								furnaceWindow.close();
							}
						}).catch(err => {
							const failMsg = `Failed to put item in furnace: ${err.message}`;
							console.log(`[${bot.username}] ${failMsg}`);
							furnaceWindow.close();
						});
					}).catch(err => {
						const failMsg = `Failed to open furnace: ${err.message}`;
						console.log(`[${bot.username}] ${failMsg}`);
					});
				} else {
					const failMsg = `Don't have enough ${smeltItem} to smelt`;
					console.log(`[${bot.username}] ${failMsg}`);
				}
			} else {
				const failMsg = `No furnace found nearby`;
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
			
		case 'clearFurnace': {
			const msg = `Clearing furnace`;
			console.log(`[${bot.username}] ${msg}`);
			const clearFurnace = bot.findBlock({
				matching: (block) => block.name === 'furnace' || block.name === 'blast_furnace',
				maxDistance: 6
			});
			if (clearFurnace) {
				bot.openFurnace(clearFurnace).then(furnaceWindow => {
					furnaceWindow.takeOutput().then(() => {
						furnaceWindow.takeFuel().then(() => {
							furnaceWindow.takeInput().then(() => {
								const doneMsg = `Cleared all items from furnace`;
								console.log(`[${bot.username}] ${doneMsg}`);
								furnaceWindow.close();
							}).catch(() => furnaceWindow.close());
						}).catch(() => furnaceWindow.close());
					}).catch(() => furnaceWindow.close());
				}).catch(err => {
					const failMsg = `Failed to open furnace: ${err.message}`;
					console.log(`[${bot.username}] ${failMsg}`);
				});
			} else {
				const failMsg = `No furnace found nearby`;
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
			
		case 'placeHere': {
			const placeItem = bot.inventory.items().find(i => i.name === params[0]);
			if (!placeItem) {
				const msg = `Don't have ${params[0]} to place`;
				console.log(`[${bot.username}] ${msg}`);
				break;
			}
			const msg = `Searching for a valid spot to place ${params[0]} nearby...`;
			console.log(`[${bot.username}] ${msg}`);
			const basePos = bot.entity.position.floored();
			const radius = 2;
			let placed = false;
			bot.equip(placeItem, 'hand').then(async () => {
				outer: for (let dx = -radius; dx <= radius; dx++) {
					for (let dy = -1; dy <= 1; dy++) {
						for (let dz = -radius; dz <= radius; dz++) {
							const refPos = basePos.offset(dx, dy, dz);
							const block = bot.blockAt(refPos);
							if (!block || block.name === 'air' || block.name === 'water' || block.name === 'lava') continue;
							// Try all faces (top, bottom, sides)
							const faces = [
								{ x: 0, y: 1, z: 0 }, // top
								{ x: 0, y: -1, z: 0 }, // bottom
								{ x: 1, y: 0, z: 0 },
								{ x: -1, y: 0, z: 0 },
								{ x: 0, y: 0, z: 1 },
								{ x: 0, y: 0, z: -1 },
							];
							for (let f = 0; f < faces.length; f++) {
								const face = faces[f];
								const placePos = refPos.offset(face.x, face.y, face.z);
								const placeBlock = bot.blockAt(placePos);
								if (placeBlock && placeBlock.name === 'air') {
									// Check if bot can place here
									try {
										if (typeof bot.canPlaceBlock === 'function' && !(await bot.canPlaceBlock(block, face))) continue;
										await bot.placeBlock(block, face);
										const doneMsg = `Placed ${params[0]} at ${placePos.x},${placePos.y},${placePos.z}`;
										console.log(`[${bot.username}] ${doneMsg}`);
										placed = true;
										break outer;
									} catch (err) {
										// Try next
									}
								}
							}
						}
					}
				}
				if (!placed) {
					const failMsg = `Could not find a valid spot to place ${params[0]} nearby.`;
					console.log(`[${bot.username}] ${failMsg}`);
				}
			}).catch(err => {
				const failMsg = `Failed to equip ${params[0]}: ${err.message}`;
				console.log(`[${bot.username}] ${failMsg}`);
			});
			break;
		}
			
		case 'attack': {
							const attackEntity = Object.values(bot.entities).find(e =>
								e.name === params[0] &&
								e.position.distanceTo(bot.entity.position) <= 12 // search for target within 12 blocks
							);
			if (attackEntity) {
				const msg = `Attacking nearest ${params[0]}`;
				console.log(`[${bot.username}] ${msg}`);

				// Try to equip sword, else axe, else nothing
				const equipWeapon = async () => {
					const sword = bot.inventory.items().find(i => i.name.includes('sword'));
					if (sword) {
						await bot.equip(sword, 'hand');
						return true;
					}
					const axe = bot.inventory.items().find(i => i.name.includes('axe'));
					if (axe) {
						await bot.equip(axe, 'hand');
						return true;
					}
					return false;
				};

				const followAndAttack = (entityId) => {
					let lastEntityId = entityId;
					const attackLoop = setInterval(() => {
						const target = Object.values(bot.entities).find(e => e.id === lastEntityId);
						if (
							!target ||
							!target.position ||
							target.position.distanceTo(bot.entity.position) > 12 ||
							target.health === 0
						) {
							clearInterval(attackLoop);
							clearInterval(followLoop);
							return;
						}
						const dist = target.position.distanceTo(bot.entity.position);
						if (dist > 3) {
							// Too far to attack, just pathfind closer
							bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1));
						} else {
							// Only attack if within 3 blocks (legit melee range)
							bot.attack(target);
						}
					}, 500);

					// Follow entity position updates
					const followLoop = setInterval(() => {
						const target = Object.values(bot.entities).find(e => e.id === lastEntityId);
						if (
							!target ||
							!target.position ||
							target.position.distanceTo(bot.entity.position) > 12 ||
							target.health === 0
						) {
							clearInterval(followLoop);
							clearInterval(attackLoop);
							return;
						}
						// Update goal if entity moved significantly
						bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1));
					}, 1500);

					// Optionally, stop after 30 seconds to avoid infinite loop
					setTimeout(() => {
						clearInterval(attackLoop);
						clearInterval(followLoop);
					}, 30000);
				};

				equipWeapon().then(() => {
					followAndAttack(attackEntity.id);
				}).catch(() => {
					followAndAttack(attackEntity.id);
				});
			} else {
				const msg = `No ${params[0]} found nearby to attack.`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'attackPlayer': {
			const attackTarget = bot.players[params[0]];
			if (attackTarget && attackTarget.entity) {
				const msg = `Attacking player: ${params[0]}`;
				console.log(`[${bot.username}] ${msg}`);

				const equipWeapon = async () => {
					const sword = bot.inventory.items().find(i => i.name.includes('sword'));
					if (sword) {
						await bot.equip(sword, 'hand');
						return true;
					}
					const axe = bot.inventory.items().find(i => i.name.includes('axe'));
					if (axe) {
						await bot.equip(axe, 'hand');
						return true;
					}
					return false;
				};

				const followAndAttack = (playerEntity) => {
					let lastEntityId = playerEntity.id;
					const attackLoop = setInterval(() => {
						const target = bot.players[params[0]]?.entity;
						if (
							!target ||
							!target.position ||
							target.position.distanceTo(bot.entity.position) > 12 ||
							target.health === 0
						) {
							clearInterval(attackLoop);
							clearInterval(followLoop);
							return;
						}
						const dist = target.position.distanceTo(bot.entity.position);
						if (dist > 3) {
							// Too far to attack, just pathfind closer
							bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1));
						} else {
							// Only attack if within 3 blocks (legit melee range)
							bot.attack(target);
						}
					}, 500);

					const followLoop = setInterval(() => {
						const target = bot.players[params[0]]?.entity;
						if (
							!target ||
							!target.position ||
							target.position.distanceTo(bot.entity.position) > 12 ||
							target.health === 0
						) {
							clearInterval(followLoop);
							clearInterval(attackLoop);
							return;
						}
						bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 1));
					}, 1500);

					setTimeout(() => {
						clearInterval(attackLoop);
						clearInterval(followLoop);
					}, 30000);
				};

				equipWeapon().then(() => {
					followAndAttack(attackTarget.entity);
				}).catch(() => {
					followAndAttack(attackTarget.entity);
				});
			} else {
				const msg = `Player ${params[0]} not found.`;
				console.log(`[${bot.username}] ${msg}`);
			}
			break;
		}
			
		case 'goToBed': {
			const msg = `Going to bed`;
			console.log(`[${bot.username}] ${msg}`);
			const bed = bot.findBlock({
				matching: (block) => block.name.includes('bed'),
				maxDistance: 16
			});
			if (bed) {
				bot.pathfinder.setGoal(new GoalBlock(bed.position.x, bed.position.y, bed.position.z));
				bot.once('goal_reached', () => {
					bot.sleep(bed).then(() => {
						const doneMsg = `Sleeping in bed`;
						console.log(`[${bot.username}] ${doneMsg}`);
					}).catch(err => {
						const failMsg = `Failed to sleep: ${err.message}`;
						console.log(`[${bot.username}] ${failMsg}`);
					});
				});
			} else {
				const failMsg = `No bed found nearby`;
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
			
		case 'activate': {
			const msg = `Activating nearest ${params[0]}`;
			const failMsg = `No ${params[0]} found nearby`;
			const activateBlock = bot.findBlock({
				matching: (block) => block.name === params[0],
				maxDistance: 6
			});
			if (activateBlock) {
				console.log(`[${bot.username}] ${msg}`);
				bot.pathfinder.setGoal(new GoalBlock(activateBlock.position.x, activateBlock.position.y, activateBlock.position.z));
				bot.once('goal_reached', () => {
					bot.activateBlock(activateBlock).catch(err => {
						const failMsg2 = `Failed to activate ${params[0]}: ${err.message}`;
						console.log(`[${bot.username}] ${failMsg2}`);
					});
				});
			} else {
				console.log(`[${bot.username}] ${failMsg}`);
			}
			break;
		}
			
			
		case 'digDown': {
			const digDistance = parseInt(params[0]) || 1;
			const msg = `Digging down ${digDistance} blocks`;
			console.log(`[${bot.username}] ${msg}`);
			let dug = 0;
			const digNext = () => {
				if (dug >= digDistance) {
					const doneMsg = `Finished digging down ${dug} blocks`;
					console.log(`[${bot.username}] ${doneMsg}`);
					return;
				}
				const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0));
				if (blockBelow && blockBelow.name !== 'air') {
					// Check for dangerous blocks
					if (['lava', 'water'].includes(blockBelow.name)) {
						const stopMsg = `Stopped digging - found ${blockBelow.name}`;
						console.log(`[${bot.username}] ${stopMsg}`);
						return;
					}
					// Check for dangerous fall
					const blockFarBelow = bot.blockAt(bot.entity.position.offset(0, -5, 0));
					if (blockFarBelow && blockFarBelow.name === 'air') {
						const stopMsg = `Stopped digging - dangerous fall detected`;
						console.log(`[${bot.username}] ${stopMsg}`);
						return;
					}
					bot.dig(blockBelow).then(() => {
						dug++;
						setTimeout(digNext, 1000);
					}).catch(err => {
						const failMsg = `Failed to dig: ${err.message}`;
						console.log(`[${bot.username}] ${failMsg}`);
					});
				} else {
					const failMsg = `Nothing to dig below`;
					console.log(`[${bot.username}] ${failMsg}`);
				}
			};
			digNext();
			break;
		}
			
		default:
			console.log(`[${bot.username}] Unknown command: !${command}(${params.join(', ')})`);
	}
}

module.exports = { parseAndExecuteCommands, handleQueryCommand, setMainCallbacks };
