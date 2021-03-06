import * as Discord from 'discord.js';

import { client, getDatabase } from '../index';
import * as logger from '../logger';
import { getCommands } from '../utils';
import { Command } from '../command';
import * as config from '../config';

import { getPrefix } from '../commands/config';

const database = getDatabase();

/**
 * An array of commands, set during initialization.
 * @property {Command[]} commands The commands.
 */
let commands: Command[];

export const name = 'message';

export async function init(): Promise<void> {
  logger.info('Initializing commands...');
  commands = await getCommands(config.get('commandsPath', 'commands'));

  for (const command of commands) {
    if (typeof command.init !== 'undefined') {
      await command.init();
    }
  }
}

/**
 * Executed whenever a message is received over the WebSocket.
 * @param {Discord.Message} message The message.
 */
export async function execute(message: Discord.Message): Promise<void> {
  if (message.author.bot) {
    return;
  }
  const args = message.content.split(' ');
  let prefix: string;
  try {
    const connection = await database.connect();
    if (typeof message.guild === 'undefined') {
      prefix = config.get('prefix');
    } else {
      prefix = await getPrefix(connection, message.guild.id);
    }
    connection.release();
  } catch (err) {
    logger.error('Could not get prefix from database.');
    logger.fatal(err);
  }
  if (args[0].toLowerCase().startsWith(prefix)) {
    const cmd = args[0].toLowerCase().replace(prefix, '');
    let match: Command;
    for (const command of commands) {
      if (command.aliases.includes(cmd)) {
        match = command;
      }
    }
    if (!match) {
      return;
    }
    if (match.serverOnly && !message.guild) {
      await message.channel.send('This command may only be run in a guild.');
      return;
    }
    if (!match.hasPermission(message.member)) {
      logger.debug(`${message.author.tag} attempted to execute command "${match.name}" in guild "${message.guild.name}" without permission.`);
      await message.channel.send('You do not have permission to run this command.');
      return;
    }
    logger.debug(`${message.author.tag} is executing command "${match.name}" in guild "${message.guild.name}".`);
    await message.channel.startTyping();
    const result = match.execute(client, message);
    if (result instanceof Promise) {
      await result;
    }
    message.channel.stopTyping(true);
  }
}
