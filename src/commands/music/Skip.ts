import { Command } from "../../types/Command";
import { Message } from "discord.js";

export default class Skip extends Command {
  name = "skip";
  visible = true;
  description = "Skip the current song in the queue";
  information = "";
  aliases = [];
  args = false;
  usage = "";
  example = "";
  cooldown = 0;
  category = "music";
  guildOnly = true;
  execute = (message: Message): Promise<Message> => {
    // Check if we are in a voice channel
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.channel.send(
        "You need to be in a voice channel to stop the queue!"
      );
    }

    // Check if there is a music queue
    const serverQueue = this.client.musicQueue.get(message.guild.id);
    if (!serverQueue) {
      return message.channel.send("There's no active queue");
    }

    // Check if they are in the same channel
    if (message.member.voice.channel !== serverQueue.voiceChannel) {
      return message.channel.send("You are not in the same channel");
    }

    try {
      serverQueue.connection.destroy();
    } catch (error) {
      serverQueue.songs = [];
      console.log(error);
    }
  };
}
