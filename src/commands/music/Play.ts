import { Command } from "../../types/Command";
import { IServerMusicQueue, ISong } from "../../types/interfaces/Bot";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {
  CommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageEmbed,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from "discord.js";

import ytdl = require("ytdl-core");
import ytsr = require("ytsr");

export default class Play extends Command {
  name = "play";
  visible = true;
  description = "Add a song from url to the queue";
  information =
    "Add a song from url to the queue. Once there are no more songs / all users have left the channel, the bot stays in the channel for 1 minute. If no further songs have been added, or there are still no members, then the bot leaves.";
  aliases = ["p"];
  args = true;
  usage = "[song_name] or [song_url]";
  example = "whitley nova";
  cooldown = 0;
  category = "music";
  guildOnly = true;
  data = new SlashCommandBuilder()
    .setName(this.name)
    .setDescription(this.description)
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("The name of the song to play or URL")
        .setRequired(true)
    );
  execute = async (message: Message, args: string[]): Promise<Message> => {
    message.channel.sendTyping();
    const playEmbed = await this.play(
      message.channel as TextChannel,
      message.member.voice.channel as VoiceChannel,
      message.guild,
      args
    );
    return message.channel.send({ embeds: [playEmbed] });
  };
  executeSlash = async (interaction: CommandInteraction): Promise<void> => {
    interaction.deferReply();
    interaction.member = interaction.member as GuildMember;
    const args: string[] = [interaction.options.get("song").value as string];
    const playEmbed = await this.play(
      interaction.channel as TextChannel,
      interaction.member.voice.channel as VoiceChannel,
      interaction.guild,
      args
    );
    interaction.editReply({ embeds: [playEmbed] });
  };

  /**
   * Check if the user can play a song based off permissions.
   * If they can't then notify the channel of why, else load the song from
   * youtube and play it or add it to the queue
   *
   * @param textChannel the text channel which triggered the command
   * @param voiceChannel the voice channel of the member who triggered the command
   * @param guild the server to play music in
   * @param args the song name or url
   */
  private async play(
    textChannel: TextChannel,
    voiceChannel: VoiceChannel,
    guild: Guild,
    args: string[]
  ): Promise<MessageEmbed> {
    // Check if they are in a voice channel
    if (!voiceChannel) {
      return this.createColouredEmbed(
        "You need to be in a voice channel to play music!"
      );
    }

    // Check if the bot has permissions to play music in that server
    const issue = this.hasPermissions(voiceChannel);
    if (issue !== null) {
      return this.createColouredEmbed(issue);
    }

    // Get the song info
    const songInfo: ytdl.videoInfo = await this.getSongInfo(args);
    if (songInfo === null) {
      return this.createColouredEmbed(
        "There was an error searching for that song"
      );
    }

    // Create the song object
    const duration = parseInt(songInfo.videoDetails.lengthSeconds);
    const song: ISong = {
      info: songInfo,
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
      duration: duration,
      formattedDuration: this.formatDuration(duration),
    };

    // Add the new song to the queue
    const serverQueue = this.addSongToQueue(
      song,
      guild,
      voiceChannel,
      textChannel
    );
    const guildId = guild.id;
    if (!serverQueue.isPlaying) {
      // If a new queue was created then we immediately play the song
      this.playSong(guildId, this.client.musicQueue);
    }
    return this.createColouredEmbed(
      `Queued ${this.getFormattedLink(song)} (${song.formattedDuration})`
    );
  }

  /**
   * Read the user's arguments and get the song from youtube
   *
   * @param args the arguments of the user
   * @returns the song info of their desired song
   */
  private async getSongInfo(args: string[]): Promise<ytdl.videoInfo> {
    let songInfo = null;
    if (ytdl.validateURL(args[0])) {
      // Find the song details from URL
      songInfo = await ytdl.getInfo(args[0]);
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
      }
    }
    return songInfo;
  }

  /**
   * Given the song, create an audio player for the song, or throw an
   * error if it does not start playing in 5 seconds
   *
   * @param song the song to play
   * @returns a promise to the created audio player
   */
  private async getSongPlayer(song: ISong): Promise<AudioPlayer> {
    const player = createAudioPlayer();
    const stream = ytdl(song.url, {
      filter: "audioonly",
      highWaterMark: 1 << 25,
    });
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });
    player.play(resource);
    return entersState(player, AudioPlayerStatus.Playing, 5_000);
  }

  /**
   * Connect to a voice channel and returns the VoiceConnection. If we
   * cannot connect within 30 seconds, throw an error
   *
   * @param channel the voice channel to connect to
   * @returns the VoiceConnection after we connect
   */
  private async connectToChannel(
    channel: VoiceChannel | StageChannel
  ): Promise<VoiceConnection> {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      return connection;
    } catch (error) {
      connection.destroy();
      throw error;
    }
  }

  /**
   * Add the song info to the server's music queue. If there is no queue, a new
   * one is made.
   *
   * @param song the song to add to the queue
   * @param message the message that triggered this command
   * @returns the server's music queue
   */
  private addSongToQueue(
    song: ISong,
    guild: Guild,
    voiceChannel: VoiceChannel,
    textChannel: TextChannel
  ): IServerMusicQueue {
    let musicQueue: IServerMusicQueue = this.client.musicQueue.get(guild.id);
    if (musicQueue === undefined) {
      musicQueue = {
        voiceChannel: voiceChannel,
        textChannel: textChannel as TextChannel,
        songs: [],
        audioPlayer: null,
        playingMessage: null,
        isPlaying: false,
        isRepeating: false,
      };
      this.client.musicQueue.set(guild.id, musicQueue);
    }

    musicQueue.songs.push(song);
    return musicQueue;
  }

  /**
   * Plays the next song in the queue. Once the song ends, pop it from the
   * queue and recursively call this function
   *
   * @param guildId the id of the server the bot is playing music in
   * @param musicQueue a map from a server's id to it's music queue
   * @returns a message saying which song it is currently playing
   */
  private async playSong(
    guildId: string,
    musicQueue: Map<string, IServerMusicQueue>
  ): Promise<void> {
    const serverQueue = musicQueue.get(guildId);
    if (!serverQueue) {
      return;
    }
    // Base case
    if (serverQueue.songs.length === 0) {
      return this.handleEmptyQueue(guildId, musicQueue, serverQueue, 60_000);
    }
    const song = serverQueue.songs[0];
    const connection = await this.connectToChannel(serverQueue.voiceChannel);
    serverQueue.audioPlayer = await this.getSongPlayer(song);
    connection.subscribe(serverQueue.audioPlayer);
    serverQueue.isPlaying = true;

    serverQueue.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      serverQueue.isPlaying = false;
      this.handleSongFinish(guildId, musicQueue, serverQueue);
    });

    // Send to channel which song we are playing
    this.sendPlayingEmbed(serverQueue);
  }

  /**
   * Handles what to do when the the current song finishes. If the server has
   * repeat active, then add the new song. If the queue is not empty, plays the
   * next song.
   *
   * @param guildId the id of the relevant server
   * @param musicQueue the mapping of server ids to their music queue
   * @param serverQueue the relevant server's music queue
   */
  handleSongFinish(
    guildId: string,
    musicQueue: Map<string, IServerMusicQueue>,
    serverQueue: IServerMusicQueue
  ): void {
    if (serverQueue !== null) {
      const song = serverQueue.songs[0];
      if (serverQueue.isRepeating) {
        serverQueue.songs.push(song);
      }
      serverQueue.songs.shift();
      this.playSong(guildId, musicQueue);
    }
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
  handleEmptyQueue(
    guildId: string,
    musicQueue: Map<string, IServerMusicQueue>,
    serverQueue: IServerMusicQueue,
    timeoutDuration: number
  ): void {
    const connection = getVoiceConnection(guildId);
    if (serverQueue.voiceChannel.members.size === 0) {
      // If there are no more members
      connection.destroy();
      musicQueue.delete(guildId);
      this.createAndSendEmbed(
        serverQueue.textChannel,
        "Stopping music as all members have left the voice channel"
      );
      return;
    }
    // Wait for 1 minute and if there is no new songs, leave
    setTimeout(() => {
      if (serverQueue.songs.length === 0) {
        connection.destroy();
        musicQueue.delete(guildId);
        return;
      }
    }, timeoutDuration);
  }

  /**
   * Sends a message about the current playing song. If the bot had sent a
   * message like this for the previous song it played, delete that message
   *
   * @param serverQueue the queue for the relevant server
   */
  sendPlayingEmbed(serverQueue: IServerMusicQueue): void {
    const song = serverQueue.songs[0];
    const songLink = this.getFormattedLink(song);
    this.createAndSendEmbed(
      serverQueue.textChannel,
      `Now playing ${songLink} (${song.formattedDuration})`
    ).then((message) => {
      if (serverQueue.playingMessage !== null) {
        serverQueue.playingMessage.delete();
      }
      serverQueue.playingMessage = message;
    });
    return;
  }
}
