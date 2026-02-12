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
        "网吧老哥看你屏幕后的反应",
        "出租车司机边开车边评价你",
        "食堂大妈打菜时顺嘴损你",
        "你妈站在你身后看你玩游戏",
        "对面打野打完你后在全频打字",
        "解说在复盘你的操作",
        "队友在语音里忍不住了",
        "游戏结束后对面加你好友说的话"
      ];
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];

      const langPrompt = context.language === 'en'
        ? 'Output language: English. Sound like a real tilted gamer on voice chat.'
        : 'Output language: Chinese (Mandarin). 像真人在语音里喷人，用口语、网络用语、语气词。';

      // ElevenLabs V3 Dialogue API supports emotion audio tags
      const emotionInstruction = config.tts.provider === 'elevenlabs'
        ? '\n- Use ElevenLabs audio tags to express tone. Pick 1-3 tags: [laughs], [sighs], [sarcastic tone], [dramatic tone], [deadpan], [shouts], [whispers], [chuckles], [angry], [frustrated], [mischievously], [shocked], [under breath]. Example: "[sarcastic tone] 哦，0/5，真有你的。[laughs] 你键盘还在吗？"'
        : '\n- NO SPECIAL TAGS.';

      const messages = [
        {
          role: "system",
          content: `你是一个嘴臭的LOL老玩家，专门在语音里喷人。

要求：
- 说人话！像真人在语音聊天里喷队友，不要写作文
- 用短句、口语、网络流行语、语气词（啊、吧、呢、呗、得了）
- 必须结合玩家的 KDA、补刀、游戏时间来精准嘲讽
- 够损够毒，但要有创意，不要只会说"你好菜"
- 40字以内，一句话说完，别啰嗦
- 禁止书面语、文言文、诗词、排比句
- 禁止表情符号、hashtag${emotionInstruction}
- ${langPrompt}
- 场景：${randomTheme}`
        },
        {
          role: "user",
          content: `Event: ${context.event}
Champion: ${context.champion || 'Unknown'}
Stats: KDA ${context.kda}, CS ${context.cs}
Time: ${Math.floor(context.gameTime / 60)}min
Context: ${context.details || 'Played poorly'}
Roast them now.`
        }
      ];

      const response = await axios.post(
        `${this.baseUrl} / chat / completions`,
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

module.exports = new LLMService();;
