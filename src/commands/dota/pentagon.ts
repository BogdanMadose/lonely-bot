import { Command } from "../Command";
import { Message } from "discord.js";

export default class Pentagon extends Command {
  name = "pentagon";
  visible = false;
  description = "Returns a list of top counters to given heroes";
  information =
    "Given 5 values of the player's pentagon, it gives the area of the pentagon with those values, the maximum possible area by swapping value positions, and the ratio of area of the given area to the maximum area.";
  aliases: string[] = [];
  args = true;
  usage = "[Fighting] [Farming] [Supporting] [Pushing] [Versatility]";
  example = "7.5 0.5 9.8 5.1 0.7";
  cooldown = 0;
  category = "dota";
  guildOnly = false;
  execute = (message: Message, args: string[]): Promise<Message> => {
    if (args.length !== 5) {
      return message.channel.send("You didn't give 5 values");
    }
    // Strip commas and space from the numbers if there are any at the end
    args.forEach((arg) => arg.replace(/[ ,]/g, ""));

    const unsortedArgs = [...args].map(Number);
    args.sort((a, b) => parseFloat(a) - parseFloat(b));
    const sortedArgs = [args[1], args[3], args[4], args[2], args[0]].map(
      Number
    );
    const max = [10, 10, 10, 10, 10];
    const maxArea = area(message, max);
    const unsortedArea = area(message, unsortedArgs);
    if (isNaN(unsortedArea)) return;
    const sortedArea = area(message, sortedArgs);
    if (isNaN(sortedArea)) return;

    const unsortedPercentage = (unsortedArea * 100) / maxArea;
    const sortedPercentage = (sortedArea * 100) / maxArea;

    message.channel.send(
      `The area of your pentagon is **${area(message, unsortedArgs).toFixed(
        2
      )}**, rating: **${unsortedPercentage.toFixed(2)}%**`
    );
    message.channel.send(
      `Max area of your pentagon is **${area(message, sortedArgs).toFixed(
        2
      )}**, rating: **${sortedPercentage.toFixed(2)}%**.`
    );
  };
}

// Given the five lengths from center to corners of pentagon, calculate area
function area(message: Message, lengths: number[]): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    if (isNaN(lengths[i])) {
      message.channel.send(
        `${lengths[i]} is not a number - example usage is \`>pentagon 7.5 0.5 9.8 5.1 0.7\`.`
      );
      return NaN;
    }
    if (lengths[i] > 0 && lengths[i] <= 10) {
      sum += 0.5 * lengths[i] * lengths[i + 1] * Math.sin((72 * Math.PI) / 180);
    } else {
      message.channel.send(`${lengths[i]} was not a valid value.`);
      return NaN;
    }
  }
  sum += 0.5 * lengths[0] * lengths[4] * Math.sin((72 * Math.PI) / 180);
  return sum;
}
