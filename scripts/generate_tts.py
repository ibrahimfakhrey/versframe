#!/usr/bin/env python3
"""
Generate Arabic voice encouragement MP3 files using Google Cloud TTS.

Usage:
    GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json python scripts/generate_tts.py

Requirements:
    pip install google-cloud-texttospeech
"""

import os
import sys

# Messages: page_key -> Arabic text
MESSAGES = {
    'onboarding_step1': 'أهلاً وسهلاً بك يا بطل! مرحباً بك في شلبي فيرس! رحلة ممتعة بانتظارك!',
    'onboarding_step2': 'يلا نصمم شخصيتك! اختر الشكل اللي يعجبك!',
    'onboarding_step3': 'ممتاز! اختر الأسلوب اللي يناسبك في التعلم!',
    'onboarding_step4': 'حلو! حدثنا عن نفسك، نحن نحب نتعرف عليك!',
    'onboarding_step5': 'آخر خطوة! اختر عالمك الأول وابدأ المغامرة!',
    'dashboard': 'أهلاً بك من جديد يا بطل! يومك مليء بالمغامرات!',
    'profile': 'ملفك الشخصي رائع! أنت نجم متألق!',
    'activities': 'يلا نبدأ الأنشطة! كل نشاط يقربك من النجاح!',
    'library': 'مرحباً بك في المكتبة! المعرفة كنز وأنت المستكشف!',
    'rewards': 'مبروك! حان وقت جمع المكافآت!',
    'quests': 'مهمات جديدة بانتظارك! هل أنت جاهز للتحدي؟',
    'timetable': 'جدولك جاهز! نظم وقتك وكن بطلاً منظماً!',
    'verses_map': 'خريطة العوالم أمامك! استكشف وتعلم وامرح!',
    'progress': 'أنت تتقدم بشكل رائع! استمر يا بطل!',
    'leaderboard': 'هل أنت مستعد لتتصدر القائمة؟ نافس أصدقاءك!',
    'sessions': 'حان وقت التعلم! استعد للحصة!',
    'homework': 'واجباتك هنا! حان وقت التألق والإبداع!',
}


def main():
    try:
        from google.cloud import texttospeech
    except ImportError:
        print("ERROR: google-cloud-texttospeech not installed.")
        print("Run: pip install google-cloud-texttospeech")
        sys.exit(1)

    if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
        print("WARNING: GOOGLE_APPLICATION_CREDENTIALS not set.")
        print("Usage: GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json python scripts/generate_tts.py")
        sys.exit(1)

    # Output directory
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'app', 'static', 'audio', 'tts')
    os.makedirs(output_dir, exist_ok=True)

    client = texttospeech.TextToSpeechClient()

    voice = texttospeech.VoiceSelectionParams(
        language_code='ar-XA',
        name='ar-XA-Chirp3-HD-Leda',  # Chirp3-HD: most natural female voice
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        pitch=0.0,           # Chirp3-HD handles natural tone internally
        speaking_rate=1.0,   # Natural speed — Chirp3 handles pacing well
    )

    generated = 0
    skipped = 0

    for page_key, text in MESSAGES.items():
        out_path = os.path.join(output_dir, f'{page_key}.mp3')

        if os.path.exists(out_path):
            print(f"  SKIP  {page_key}.mp3 (already exists)")
            skipped += 1
            continue

        print(f"  GEN   {page_key}.mp3 ...", end=' ', flush=True)

        synthesis_input = texttospeech.SynthesisInput(text=text)
        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        with open(out_path, 'wb') as f:
            f.write(response.audio_content)

        size_kb = len(response.audio_content) / 1024
        print(f"OK ({size_kb:.1f} KB)")
        generated += 1

    print(f"\nDone! Generated: {generated}, Skipped: {skipped}, Total: {len(MESSAGES)}")
    print(f"Output: {os.path.abspath(output_dir)}")


if __name__ == '__main__':
    main()
