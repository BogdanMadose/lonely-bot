module.exports = {
    name: 'pentagon',
    aliases: [`areapentagon`, `dotapentagon`],
    description: `Given 5 values of the player's pentagon, it gives the area of the pentagon`,
    usage: [`[Fighting] [Farming] [Supporting] [Pushing] [Versatility]`],
	execute(message, args) {

        if (args.length != 5) {
            return message.channel.send(`You didn't give 5 values`);
        }

        function area(lengths) {
            let sum = 0;
            for (let i = 0; i < 4; i++) {
                if (0 <= lengths[i] && lengths[i] <= 10) {
                    sum += (0.5) * (lengths[i]) * (lengths[i + 1]) * (Math.sin(72 * Math.PI / 180));
                }
                else {
                    return message.channel.send(`${lengths[i]} was not a valid value`);
                }
            }
            sum += (0.5) * (lengths[0]) * (lengths[4]) * (Math.sin(72 * Math.PI / 180));

            return sum;
        }
        
        args.sort((a,b)=>a-b);
        let sortedArgs = [args[1], args[3], args[4], args[2], args[0]];
        let proportion = (area(args) * 100) / area(sortedArgs);

        message.channel.send(`The area of your pentagon is **${area(args)}**`);
        message.channel.send(`Max area of your pentagon is **${area(sortedArgs)}**`);
        message.channel.send(`Your pentagon is **${proportion.toFixed(2)}%** of it's maximum area`)
	},
};