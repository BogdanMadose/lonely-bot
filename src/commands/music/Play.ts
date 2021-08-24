import { Command } from "../../types/Command";
import { IServerMusicQueue, ISong } from "../../types/interfaces/Bot";
import { Message, MessageEmbed, TextChannel } from "discord.js";
import * as ytdl from "ytdl-core";
import * as ytsr from "ytsr";

export default class Play extends Command {
  name = "play";
  visible = true;
  description = "Add a song from url to the queue";
  information =
    "Add a song from url to the queue. Once there are no more songs / all users have left the channel, the bot stays in the channel for 1 minute. If no further songs have been added, or there are still no members, then the bot leaves.";
  aliases = ["p"];
  args = true;
  usage = "";
  example = "193480093";
  cooldown = 0;
  category = "music";
  guildOnly = true;
  execute = async (message: Message, args: string[]): Promise<Message> => {
    // Check if we are in a voice channel
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      message.channel.send("You need to be in a voice channel to play music!");
      return;
    }

    // Check if teh bot has permissions to play music in that server
    if (!this.hasPermissions(voiceChannel, message)) {
      return;
    }

    let songInfo: ytdl.videoInfo = null;
    if (ytdl.validateURL(args[0])) {
      // Find the song details from URL
      songInfo = await ytdl.getInfo(args[0]);
      if (!songInfo) {
        return message.channel.send("Could not find details from youtube");
      }
    } else {
      try {
        const searchString = await ytsr.getFilters(args.join(" "));
        const videoSearch = searchString.get("Type").get("Video");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any = await ytsr(videoSearch.url, {
          limit: 1,
        });
        songInfo = await ytdl.getInfo(results.items[0].url);
      } catch (error) {
        console.log(error);
        return message.channel.send(
          "There was an error searching for that song"
        );
      }
    }

    // Collect song details
    const duration = parseInt(songInfo.videoDetails.lengthSeconds);
    const song: ISong = {
      info: songInfo,
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
      duration: duration,
      formattedDuration: this.formatDuration(duration),
    };

    // Check if there is a music queue
    const musicQueue = this.client.musicQueue;
    const guildId = message.guild.id;
    const serverQueue = musicQueue.get(guildId);

    if (!serverQueue) {
      // Create the new queue
      const queueConstruct: IServerMusicQueue = {
        voiceChannel: voiceChannel,
        textChannel: message.channel as TextChannel,
        connection: null,
        songs: [],
        playingMessage: null,
        playing: true,
        isRepeating: false,
      };

      // Add the queue
      musicQueue.set(guildId, queueConstruct);
      queueConstruct.songs.push(song);

      // Play the song
      try {
        // Join the voice channel
        queueConstruct.connection = await voiceChannel.join();
        playSong(guildId, musicQueue);
      } catch (error) {
        // Catch error and remove the server's queue
        console.log(error);
        musicQueue.delete(message.guild.id);
      }
    } else {
      // Add the new song to the queue
      serverQueue.songs.push(song);
      const playEmbed = new MessageEmbed()
        .setColor("#0099ff")
        .setDescription(
          `Queued **[${song.title}](${song.url})** (**${song.formattedDuration}**)`
        );
      message.channel.send(playEmbed);
      // If it is the only song in the queue
      if (serverQueue.songs.length === 1) {
        playSong(guildId, musicQueue);
      }
    }
  };
}

/**
 * Plays the next song in the queue. Once the song ends, pop it from the
 * queue and recursively call this function
 *
 * @param guildId the id of the server the bot is playing music in
 * @param musicQueue a map from a server's id to it's music queue
 * @returns a message saying which song it is currently playing
 */
function playSong(
  guildId: string,
  musicQueue: Map<string, IServerMusicQueue>
): void {
  const serverQueue = musicQueue.get(guildId);
  if (!serverQueue) {
    return;
  }

  // Base case
  if (serverQueue.songs.length === 0) {
    return handleEmptyQueue(guildId, musicQueue, serverQueue, 60_000);
  }

  const song = serverQueue.songs[0];
  serverQueue.connection
    .play(
      ytdl.downloadFromInfo(song.info, {
        highWaterMark: 1 << 25, // Increase memory for song to 32 mb
        filter: "audioonly",
      })
    )
    .on("finish", () => {
      if (serverQueue !== null) {
        if (serverQueue.isRepeating) {
          serverQueue.songs.push(song);
        }
        serverQueue.songs.shift();
        playSong(guildId, musicQueue);
      }
    })
    .on("error", (error) => {
      console.log(error);
    });
  serverQueue.textChannel
    .send(
      new MessageEmbed()
        .setColor("#0099ff")
        .setDescription(
          `Playing **[${song.title}](${song.url})** (**${song.formattedDuration}**)`
        )
    )
    .then((message) => {
      if (serverQueue.playingMessage !== null) {
        serverQueue.playingMessage.delete();
      }
      serverQueue.playingMessage = message;
    });
}

/**
 * Handles what to do when the queue is empty. If there are no more members,
 * then leave immediate, else wait for a specified duration, and then leave.
 *
 * @param guildId the id of the relevant server
 * @param musicQueue the mapping of server ids to their music queue
 * @param serverQueue the relevant server's music queue
 * @param timeoutDuration how long to stay in the voice channel before leaving
 */
function handleEmptyQueue(
  guildId: string,
  musicQueue: Map<string, IServerMusicQueue>,
  serverQueue: IServerMusicQueue,
  timeoutDuration: number
): void {
  if (serverQueue.voiceChannel.members.size === 0) {
    // If there are no more members
    serverQueue.voiceChannel.leave();
    serverQueue.textChannel.send(
      "Stopping music as all members have left the voice channel"
    );
    musicQueue.delete(guildId);
  } else {
    // Wait for 1 minute and if there is no new songs, leave
    setTimeout(() => {
      if (serverQueue.songs.length === 0) {
        serverQueue.voiceChannel.leave();
        musicQueue.delete(guildId);
        return;
      }
    }, timeoutDuration);
  }
}
