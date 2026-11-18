// Made-up journal content for the demo backup. None of it comes from a real
// journal. `daysAgo` counts back from the capture day (1 = yesterday).

/** The entry the screenshots focus on: yesterday, with both photos and a voice note. */
export const featured = {
  daysAgo: 1,
  time: '07:01',
  mood: 'HAPPY',
  title: 'Who is the one person who always supported you?',
  text:
    "I'm thankful for my dad, who shows up every time I get stuck, without me having to ask.\n" +
    "I'm grateful that he believed in me long before I believed in myself. Thank you for never doubting me, not even once. ❤️",
  photos: ['selfie', 'restaurant'],
  voice: true,
};

/** Recent days, newest first, starting the day before the featured entry. */
export const recent = [
  {
    time: '21:40',
    mood: 'AMAZING',
    text: "I'm grateful that I have a good sense of hearing. It lets me enjoy music, rain on the window and my friends' terrible jokes.",
  },
  {
    time: '08:15',
    mood: 'HAPPY',
    title: 'Small wins',
    text: "I'm thankful for the chair I sit on while I code. My back finally stopped complaining.\nI'm grateful for the script that renamed 400 photos for me in two seconds.",
  },
  {
    time: '22:05',
    text: "I'm grateful for the neighbour who waters my plants whenever I travel. Came back to a greener balcony than I left.",
  },
  {
    time: '07:30',
    mood: 'HAPPY',
    text: "I'm thankful for the metro card. No traffic, no parking, and twenty extra minutes to read every morning.",
  },
  {
    time: '20:12',
    mood: 'OKAY',
    text: "I'm grateful that the long day is over and that I still had the energy to call my sister.",
  },
  {
    time: '18:47',
    mood: 'AMAZING',
    title: 'Mum’s cooking',
    text: "I'm grateful for mum's rajma chawal on a rainy Sunday. Nothing else tastes like home.",
  },
  {
    time: '09:02',
    text: "I'm thankful for the people who write good documentation. You saved my whole afternoon.",
  },
  {
    time: '21:18',
    mood: 'HAPPY',
    text: "I'm grateful for the evening walk with my friend. We talked for an hour and solved none of our problems, and that was fine.",
  },
  {
    time: '06:55',
    text: "I'm grateful for the first cup of tea and the quiet before everyone else wakes up.",
  },
  {
    time: '19:30',
    mood: 'HAPPY',
    text: "I'm thankful for the stranger who held the lift for me when my hands were full of groceries.",
  },
];

/** "On this day" memory four years before the capture day. */
export const memory = {
  yearsAgo: 4,
  time: '20:40',
  mood: 'AMAZING',
  text: "I'm grateful for my new laptop. It's fast, it's quiet, and it can finally run the games I've wanted to play for years.",
};

/** Short filler for older days that never appear on screen. */
export const filler = [
  "I'm grateful for a good night's sleep.",
  "I'm thankful for a warm shower on a cold morning.",
  "I'm grateful for the friend who checked in on me today.",
  "I'm thankful for fresh mangoes from the market.",
  "I'm grateful that the bug I feared was a typo.",
  "I'm thankful for a long phone call with my grandmother.",
  "I'm grateful for the sunset from the office window.",
  "I'm thankful for a quiet lunch in the park.",
  "I'm grateful for my bicycle and the empty roads on Sunday.",
  "I'm thankful for a book I couldn't put down.",
  "I'm grateful for clean sheets and an early night.",
  "I'm thankful for the colleague who covered for me.",
  "I'm grateful for the smell of rain on dry ground.",
  "I'm thankful for my favourite song on the radio.",
  "I'm grateful for a slow breakfast with my family.",
  "I'm thankful for the doctor who explained everything patiently.",
  "I'm grateful that the train was on time today.",
  "I'm thankful for my old headphones that still work.",
  "I'm grateful for a long hot cup of coffee.",
  "I'm thankful for a lazy afternoon with nothing planned.",
  "I'm grateful for the teacher who never gave up on me.",
  "I'm thankful for the cat that sleeps on my keyboard.",
  "I'm grateful for a walk by the lake.",
  "I'm thankful for my health and a body that carries me.",
  "I'm grateful for a message from an old friend.",
  "I'm thankful for the street food stall near my office.",
  "I'm grateful for finishing the project on time.",
  "I'm thankful for a clear sky full of stars.",
];

export const fillerMoods = ['HAPPY', null, 'AMAZING', 'OKAY', null, 'HAPPY'];
