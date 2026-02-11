const axios = require('axios');
const config = require('../config');
const logger = require('../logger');

class LLMService {
  constructor() {
    // Config is read dynamically via getters for hot-reload support
  }

  get apiKey() { return config.llm.apiKey; }
  get baseUrl() { return config.llm.baseUrl.replace(/\/$/, ''); }
  get model() { return config.llm.model; }
  get enabled() { return config.llm.enabled && this.apiKey.length > 0; }

  async generateRoast(context) {
    if (!this.enabled) {
      console.log('[LLM] Disabled or no API Key.');
      return null;
    }

    try {
      const startTime = Date.now();
      console.log(`[LLM] Generating roast for: ${context.event}...`);

      const themes = [
        "compare them to a minion",
        "question their internet connection",
        "mock their reaction time",
        "imply they are a bot",
        "suggest they uninstall",
        "compare them to a jungle camp",
        "act like a disappointed parent",
        "suspect them of being an undercover agent for the enemy"
      ];
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];

      const langPrompt = context.language === 'en'
        ? `Language: English (Toxic Gamer Slang). Style: Savage, creative, unhinged. Theme: ${randomTheme}.`
        : `Language: Chinese (Mandarin). Style: 阴阳怪气, 嘴臭, 很有创意. Theme: ${randomTheme}.`;

      // ElevenLabs V3 Dialogue API supports emotion audio tags
      const emotionInstruction = config.tts.provider === 'elevenlabs'
        ? `\n          - Use ElevenLabs audio tags to express tone. Pick 1-3 tags that fit naturally. Available tags: [happy], [excited], [sad], [angry], [frustrated], [nervous], [curious], [mischievously], [skeptical], [cynical], [shocked], [surprised], [confused], [confident], [resolute], [deadpan], [whispers], [shouts], [quietly], [loudly], [under breath], [dramatic tone], [sarcastic tone], [matter-of-fact], [conversational tone], [serious tone], [lighthearted], [playfully], [laughs], [sighs], [heavy sigh], [chuckles], [giggles], [gulps], [gasps], [coughs], [stammers], [hesitates], [pauses], [rushed], [slows down], [emphasized], [continues softly], [rageful], [envious], [apprehensive], [tense], [terrified], [cheerful], [blissful], [grateful], [relieved], [eager], [enthusiastic], [thrilled], [proud], [brave], [serene], [caring], [compassionate], [wistful], [reflective], [sob], [wail], [clapping]. Example: "[sarcastic tone] 哦，0/5，真有你的。[laughs] 你键盘还在吗？"`
        : '\n          - NO SPECIAL TAGS.';

      const messages = [
        {
          role: "system",
          content: `You are a savage, toxic League of Legends coach. Your job is to creatively roast the player.
          - VARY YOUR SCENARIOS. Do not simple say "you are bad".
          - Use specific metaphors (League specific).
          - Be unpredictable.
          - STRICT LIMIT: Keep response under 50 words.
          - NO HASHTAGS. NO EMOJIS.${emotionInstruction}
          - ${langPrompt}`
        },
        {
          role: "user",
          content: `Event: ${context.event}. 
          Stats: KDA ${context.kda}, CS ${context.cs}.
          Time: ${context.gameTime}m.
          Ctx: ${context.details || 'Played poorly'}.
          Roast them now.`
        }
      ];

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          temperature: 1.3, // High creativity to avoid repetition
          stream: false
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 30000 // 30s timeout for thinking models
        }
      );

      // Debug: Log full response structure if needed
      // logger.ai('Raw Response:', response.data);

      const choice = response.data?.choices?.[0];
      if (!choice || !choice.message || !choice.message.content) {
        logger.error('[LLM] Invalid response structure:', JSON.stringify(response.data, null, 2));
        return null;
      }

      const content = choice.message.content.trim();
      const duration = Date.now() - startTime;
      logger.ai(`Generated in ${duration}ms: "${content}"`);

      return content;
    } catch (error) {
      console.error('[LLM] Error generation:', error.message);
      if (error.response) {
        console.error('[LLM] Response Data:', error.response.data);
      }
      return null;
    }
  }
}

module.exports = new LLMService();
