require('dotenv').config();
const Discord = require("discord.js");
const Twit = require("twit");
const client = new Discord.Client();
const base64 = require("node-base64-image");

const keys = {
  consumer_key: process.env.consumer_key,
  consumer_secret: process.env.consumer_secret,
  access_token: process.env.access_token,
  access_token_secret: process.env.access_token_secret
};

const T = new Twit(keys);

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("message", msg => {
  if (msg.content === "ping") {
    msg.reply("pong");
  }

  if (msg.channel.name == "cooked") {
    if (msg.attachments || msg.content) {
      const result = msg.attachments.map((res, i) => {
        return res.proxyURL;
      });

      // const cookGroup = `https://www.twitter.com/${co}`;

      const success_msg = `Success from Dragon Energy - By ${
        msg.author.username
      }`;
      const splitMsg = msg.content.split(" ");
      const newMsg = splitMsg.filter((result, i) => {
        if (result.includes("https") || result.includes("http")) {
          return result;
        }
      });

      const obj = {
        result: result[0],
        content: newMsg[0]
      };

      // encoding image for twitter..
      base64.encode(
        obj.result || obj.content,
        {
          string: true
        },
        (err, image) => {
          if (!err) {
            post(image);
          } else {
            return false;
          }
        }
      );

      /* posting to twitter */
      function post(img) {
        T.post(
          "media/upload",
          {
            media_data: img
          },
          (err, data, response) => {
            if (!err) {
              var mediaIdStr = data.media_id_string;
              var altText = success_msg;
              var meta_params = {
                media_id: mediaIdStr,
                alt_text: { text: altText }
              };

              T.post(
                "media/metadata/create",
                meta_params,
                (err, data, response) => {
                  if (!err) {
                    var params = { status: altText, media_ids: [mediaIdStr] };

                    T.post(
                      "statuses/update",
                      params,
                      (err, data, response) => {
                        const tweet_id = data.id_str;
                        console.log(
                          `Tweet Sent: https://twitter.com/${
                            data.user.screen_name
                          }/status/${data.id_str}`
                        );

                        // Favorite tweet
                        favorite(tweet_id);
                        // retweeting tweet
                        // retweet(tweet_id);
                      }
                    );
                  } else {
                    return false;
                  }
                }
              );
            } else {
              return false;
            }
          }
        );
      }

      /* Liking tweet */
      function favorite(tweetid) {
        T.post(
          "favorites/create",
          {
            id: tweetid
          },
          (err, data, response) => {
            if (!err && response) {
              console.log("Favorited Tweet with id " + tweetid);
              return true;
            }
          }
        );
      }

      /* Retweeting tweet */
      function retweet(tweetid) {
        T.post(
          "statuses/retweet/:id",
          {
            id: tweetid
          },
          (err, data, response) => {
            if (!err && response) {
              console.log("Retweeted tweet with id " + tweetid);
              return true;
            }
          }
        );
      }
    }
  }
});

client.login(process.env.token);
