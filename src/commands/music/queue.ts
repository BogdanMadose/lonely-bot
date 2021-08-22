import { Message, MessageEmbed } from "discord.js";
import { Command } from "../Command";

export default class Queue extends Command {
  name: string = "queue";
  description: string = "Print out the current queue of songs";
  information: string = "Add a song from url to the queue. Currently only supports youtube URLs.";
  aliases: string[] = ["q"];
  args: boolean = false;
  usage: string = "";
  example: string = "";
  cooldown: number = 0;
  category: string = "music";
  guildOnly: boolean = false;
  execute = (message: Message, args: string[]): Promise<any> => {
    // Check if there is a music queue
    const serverQueue = this.client.musicQueue.get(message.guild.id);
    if (!serverQueue) {
      return message.channel.send("There's no active queue");
    }
    
    const songs = serverQueue.songs;
    let songsInQueue = "";
    let totalDuration = 0;
    
    // Collect all song details
    for (let i = 0; i < songs.length; i++) {
      totalDuration += parseInt(songs[i].duration);
    
      // Only print out the first ten songs
      if (i < 10) {
        let duration = formatDuration(songs[i].duration);
        songsInQueue += `${i + 1}: **${songs[i].title}** (${duration})\n`;
      }
    }
    
    const queueEmbed = new MessageEmbed()
      .setColor("#0099ff")
      .setDescription(
        `**${songs.length}** song(s) in queue (${formatDuration(totalDuration)})`
      )
      .addField("Songs", songsInQueue, false);
    message.channel.send(queueEmbed);
  }
}

function formatDuration(seconds) {
  seconds = parseInt(seconds);
  if (seconds === 0) {
    return "livestream";
  } else if (seconds < 3600) {
    return new Date(seconds * 1000).toISOString().substr(14, 5);
  } else {
    return new Date(seconds * 1000).toISOString().substr(11, 8);
  }
}
