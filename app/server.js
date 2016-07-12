// Jean Zhou
// jean_bot -- a bot that can give food recommendations, map directions, and play a number game

// majority of code modeled after code from: https://github.com/howdyai/botkit

import botkit from 'botkit';
import Yelp from 'yelp';
const request = require('request');
// used guide for request module: http://blog.modulus.io/node.js-tutorial-how-to-use-request-module

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
  const replyAttachment = {
    text: 'Hi! Don\'t worry, I\'m always awake.',
    attachments: [{
      image_url: 'http://giphy.com/gifs/emoji-gif-red-moon-TQPPLWqWdcQes',
    }],
  };
  bot.replyPublic(message, replyAttachment);
});

// initialize yelp
const yelp = new Yelp({
  consumer_key: process.env.YELP_CONSUMER_KEY,
  consumer_secret: process.env.YELP_CONSUMER_SECRET,
  token: process.env.YELP_TOKEN,
  token_secret: process.env.YELP_TOKEN_SECRET,
});

// hello response
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
  bot.reply(message, 'I can give you food recommendations and map directions.');
  bot.reply(message, 'I can also play a number game, if you want!');
});

// food recommendations using yelp
controller.hears(['food', 'hungry', 'eat', 'restaurant'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  // ask if user would like a food recommendation
  function askYes(response, convo) {
    convo.ask('Would you like food recommendations near you?', [
      {
        // if yes, continue
        pattern: bot.utterances.yes,
        callback: () => {
          convo.say('Great! I\'d love to help.');
          askFood(convo);
          convo.next();
        },
      },
      {
        // if no, done
        pattern: bot.utterances.no,
        callback: () => {
          convo.say('I understand, perhaps later.');
          convo.next();
        },
      },
      {
        // if don't understand, repeat
        default: true,
        callback: () => {
          convo.say('What? I\'m not sure what you\'re saying. I\'ll ask again.');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  }
  // ask what kind of food
  function askFood(convo) {
    convo.ask('What kind of food do you want?', (food) => {
      convo.say('Ok, sounds good.');
      askWhere(food, convo);
      convo.next();
    });
  }
  // ask where user is
  function askWhere(food, convo) {
    convo.ask('And where are you?', (place) => {
      convo.say(`Ok! I can try to find ${food.text} near ${place.text}. One moment.`);
      // use yelp api to get search data
      yelp.search({ term: `${food.text}`, location: `${place.text}` })
      .then((data) => {
        if (data.businesses.length === 0) {
          // if length 0, no search results
          convo.say(`Sorry! I couldn't find any ${food.text} near ${place.text}.`);
          convo.next();
        } else {
          // if results exist, use first one
          convo.say('I think I found something!');
          const replyAttachment = {
            text: `Rating: ${data.businesses[0].rating}`,
            attachments: [{
              title: `${data.businesses[0].name}`,
              title_link: `${data.businesses[0].url}`,
              text: `${data.businesses[0].snippet_text}`,
              image_url: `${data.businesses[0].image_url}`,
              color: '#7CD197',
            }],
          };
          convo.say(replyAttachment);
          convo.next();
        }
      })
      .catch((err) => {
        // if error, then due to invalid location
        convo.say(`Sorry! I couldn't find your location, ${place.text}.`);
        convo.next();
      });
    });
  }
  // start conversation chain
  bot.startConversation(message, askYes);
});

// get map directions
controller.hears(['map', 'direction', 'google', 'from'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  // ask if user wants map directions
  function askYes(response, convo) {
    convo.ask('Would you like map directions?', [
      {
        // if yes, continue
        pattern: bot.utterances.yes,
        callback: () => {
          convo.say('Great! I\'d love to help.');
          askOrigin(convo);
          convo.next();
        },
      },
      {
        // if no, stop
        pattern: bot.utterances.no,
        callback: () => {
          convo.say('I understand, perhaps later.');
          convo.next();
        },
      },
      {
        // otherwise, repeat
        default: true,
        callback: () => {
          convo.say('What? I\'m not sure what you\'re saying. I\'ll ask again.');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  }
  // ask origin of directions
  function askOrigin(convo) {
    convo.ask('Where is your origin?', (origin) => {
      convo.say('Ok.');
      askDestination(origin, convo);
      convo.next();
    });
  }
  // ask destination of directions
  function askDestination(origin, convo) {
    convo.ask('Where is your destination?', (destination) => {
      convo.say(`Ok! I will find directions from ${origin.text} to ${destination.text}. One moment.`);
      // use google maps api
      const gmapsapi = process.env.GMAP_API_KEY;
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.text}&destination=${destination.text}&key=${gmapsapi}`;
      convo.say(url);
      request(url, (error, response, body) => {
        // error in request
        if (error || response.statusCode !== 200) {
          convo.say(`Sorry! I couldn't find directions from ${origin.text} to ${destination.text}.`);
          convo.next();
        } else {
          const mapdata = JSON.parse(body);
          // no results found
          if (mapdata.status === 'NOT_FOUND') {
            convo.say(`Sorry! I couldn't find directions from ${origin.text} to ${destination.text}.`);
            convo.next();
          } else {
            // result exists
            convo.say('I think I found something!');
            // summary attachment
            const sumAttachment = {
              attachments: [{
                title: 'Summary',
                text: `Start: ${mapdata.routes[0].legs[0].start_address}\n` +
                `End: ${mapdata.routes[0].legs[0].end_address}\n` +
                `Travel distance: ${mapdata.routes[0].legs[0].distance.text}\n` +
                `Travel duration: ${mapdata.routes[0].legs[0].duration.text}`,
                color: '#C51D1D',
              }],
            };
            convo.say(sumAttachment);
            let stepString = '';
            mapdata.routes[0].legs[0].steps.forEach(step => {
              stepString = `${stepString}\n ${step.html_instructions}`;
            });
            // remove html tags
            // regular expression taken from: http://stackoverflow.com/questions/822452/strip-html-from-text-javascript
            stepString = stepString.replace(/<(?:.|\n)*?>/gm, '');
            // steps attachment
            const stepAttachment = {
              attachments: [{
                title: 'Directions',
                text: `${stepString}`,
                color: '#88a3de',
              }],
            };
            convo.say(stepAttachment);
            convo.next();
          }
        }
      });
    });
  }
  bot.startConversation(message, askYes);
});

// play a number guessing game
controller.hears(['number', 'game', 'guess', 'play'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  // ask if user would like to play
  function askYes(response, convo) {
    convo.ask('Would you like to play a game?', [
      {
        // if yes, continue
        pattern: bot.utterances.yes,
        callback: () => {
          convo.say('Great! Let\'s start!');
          convo.say('If you ever want to stop, just say \'quit\'.');
          const NUM = Math.floor((Math.random() * 100) + 1);
          convo.say('Guess the number I\'m thinking of, from 1 - 100!');
          convo.say(`The number is ${NUM}.`);
          startGame(NUM, convo);
          convo.next();
        },
      },
      {
        // if no, done
        pattern: bot.utterances.no,
        callback: () => {
          convo.say('Okay, play with me later!');
          convo.next();
        },
      },
      {
        // if don't understand, repeat
        default: true,
        callback: () => {
          convo.say('What? I\'m not sure what you\'re saying. I\'ll ask again.');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  }
  // play number game
  function startGame(NUM, convo) {
    convo.ask('Make a guess!', (guess) => {
      const intguess = parseInt(guess.text, 10);
      convo.say(`The guess is ${guess.text}`);
      convo.say(`The intguess is ${intguess}`);
      if (guess.text === 'quit') {
        convo.say('Okay, bye! Thank you for playing with me.');
        convo.say(`If you're curious, the number was ${NUM}.`);
      } else if (guess.text !== intguess.toString()) {
        convo.say('That\'s not a valid guess! Guess an integer number from 1 - 100.');
        convo.repeat();
      } else if (guess.text < NUM && guess.text > 0) {
        convo.say('Nope, higher!');
        convo.repeat();
      } else if (guess.text > NUM && guess.text < 101) {
        convo.say('Nope, lower!');
        convo.repeat();
      } else if (guess.text === NUM.toString()) {
        convo.say(`Yes, you got it! The number is ${intguess}!`);
        convo.say('You\'re good at this! Thank you for playing with me.');
      } else {
        convo.say('That\'s not a valid guess! Guess an integer number from 1 - 100.');
        convo.repeat();
      }
      convo.next();
    });
  }
  // start conversation chain
  bot.startConversation(message, askYes);
});

// doesn't understand
controller.on(['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Sorry, I\'m not sure what you\'re saying!');
  bot.reply(message, 'Updated!!');
});
