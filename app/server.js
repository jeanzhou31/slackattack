// example bot

import botkit from 'botkit';
import Yelp from 'yelp';

console.log('starting bot');

// botkit controller
const controller = botkit.slackbot({
  debug: false,
});

// initialize slackbot
const slackbot = controller.spawn({
  token: process.env.SLACK_BOT_TOKEN,
  // this grabs the slack token we exported earlier
}).startRTM(err => {
  // start the real time message client
  if (err) { throw new Error(err); }
});

// prepare webhook
// for now we won't use this but feel free to look up slack webhooks
controller.setupWebserver(process.env.PORT || 3001, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, slackbot, () => {
    if (err) { throw new Error(err); }
  });
});

// webhook reply
controller.on('outgoing_webhook', (bot, message) => {
  bot.replyPublic(message, 'Hi! Don\'t worry, I\'m always awake. http://giphy.com/gifs/emoji-gif-red-moon-TQPPLWqWdcQes');
});

// initialize yelp

const yelp = new Yelp({
  consumer_key: process.env.YELP_CONSUMER_KEY,
  consumer_secret: process.env.YELP_CONSUMER_SECRET,
  token: process.env.YELP_TOKEN,
  token_secret: process.env.YELP_TOKEN_SECRET,
});

// example hello response
controller.hears(['hello', 'hi', 'howdy'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    if (res) {
      bot.reply(message, `Hello, ${res.user.name}!`);
    } else {
      bot.reply(message, 'Hello there!');
    }
  });
});

// help
controller.hears('help', ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Hi! I\'m jean_bot!');
});

// food
controller.hears(['food', 'hungry', 'eat', 'restaurant'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  function askYes(response, convo) {
    convo.ask('Would you like food recommendations near you?', [
      {
        pattern: bot.utterances.yes,
        callback: () => {
          convo.say('Great! I will continue...');
          askFood(convo);
          convo.next();
        },
      },
      {
        pattern: bot.utterances.no,
        callback: () => {
          convo.say('Perhaps later.');
          convo.next();
        },
      },
      {
        default: true,
        callback: () => {
          convo.say('Sorry, I\'m not sure what you\'re saying.');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  }
  function askFood(convo) {
    convo.ask('What kind of food do you want?', (food) => {
      convo.say('Ok.');
      askWhere(food, convo);
      convo.next();
    });
  }
  function askWhere(food, convo) {
    convo.ask('Where are you?', (place) => {
      convo.say(`Ok! I can find ${food.text} in ${place.text}. One moment.`);
      yelp.search({ term: `${food.text}`, location: `${place.text}` })
      .then((data) => {
        if (data.businesses.length === 0) {
          convo.say(`Sorry! I couldn't find ${food.text} in ${place.text}!`);
        } else {
          const replyAttachment = {
            text: `rating: ${data.businesses[0].rating}`,
            attachments: [
              {
                fallback: 'To be useful, I need you to invite me in a channel.',
                title: `${data.businesses[0].name}`,
                title_link: `${data.businesses[0].url}`,
                text: `${data.businesses[0].snippet_text}`,
                image_url: `${data.businesses[0].image_url}`,
                color: '#7CD197',
              },
            ],
          };
          bot.reply(message, replyAttachment);
          convo.next();
        }
        data.businesses.forEach(business => {
          // do something with business
        });
      })
      .catch((err) => {
        convo.say(`Sorry! I couldn't find you location, ${place.text}.`);
      });
      convo.next();
    });
  }
  bot.startConversation(message, askYes);
});

// gmaps
controller.hears(['map', 'direction', 'google', 'from'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  function askYes(response, convo) {
    convo.ask('Would you like map directions?', [
      {
        pattern: bot.utterances.yes,
        callback: () => {
          convo.say('Great! I will continue...');
          askOrigin(convo);
          convo.next();
        },
      },
      {
        pattern: bot.utterances.no,
        callback: () => {
          convo.say('Perhaps later.');
          convo.next();
        },
      },
      {
        default: true,
        callback: () => {
          convo.say('Sorry, I\'m not sure what you\'re saying.');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  }
  function askOrigin(convo) {
    convo.ask('Where is your origin?', (origin) => {
      convo.say('Ok.');
      askDestination(origin, convo);
      convo.next();
    });
  }
  function askDestination(origin, convo) {
    convo.ask('Where is your destination?', (destination) => {
      convo.say(`Ok! I will find directions from ${origin.text} to ${destination.text}. One moment.`);
      const gmapsapi = process.env.GMAP_API_KEY;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.text}&destination=${destination.text}&key=${gmapsapi}`;
      convo.say(url);
    });
  }
  bot.startConversation(message, askYes);
});


// otherwise, doesn't understand
controller.hears('', ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Does it work. Sorry, I\'m not sure what you\'re saying!');
});
