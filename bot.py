# =========================================================
# GRAND BOARD — Telegram Bot & WebApp Launcher
# =========================================================

import os
import telebot
from telebot import types

# توکن ربات خود را از BotFather بگیرید و اینجا قرار دهید
TOKEN = os.getenv("BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")
# آدرس مینی‌اپ شما روی گیت‌هاب پیجز (مثلا https://yourusername.github.io/grand-board)
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://yourusername.github.io/grand-board")

bot = telebot.TeleBot(TOKEN)

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    user_name = message.from_user.first_name or "VIP Member"

    # متن خوش‌آمدگویی لاکچری دقیقاً مطابق پرامپت اصلی
    welcome_text = (
        f"🎩 **به GRAND BOARD خوش آمدید، {user_name}**\n"
        f"*کلوپ خصوصی و مجلل بازی‌های رومیزی شما* ♟️🎲\n\n"
        f"وارد سالن اختصاصی اصیل‌ترین بازی‌های فکری جهان شوید. ترکیبی از طراحی دارک-لاکچری با بافت مرمر سیاه و طلای برس‌خورده، فیزیک واقع‌گرایانه و حریفان هوش مصنوعی که پای میز منتظر شما هستند.\n\n"
        f"✨ **در این کلوپ چه خبر است؟**\n"
        f"• **کلکسیون سلطنتی:** شطرنج، تخته‌نرد و منچ با قوانین ۱۰۰٪ استاندارد و کامل.\n"
        f"• **حریفان هوشمند:** رقابت با ۴ شخصیت هوش مصنوعی؛ از «دوست صمیمی» تا «پادشاه بی‌رقیب».\n"
        f"• **پروفایل و افتخارات:** ثبت دقیق آمار برد و باخت، چالش‌های روزانه و شخصی‌سازی مهره‌ها و تاس‌ها.\n\n"
        f"میز مخمل چیده شده و تاس‌ها داخل جام هستند. برای ورود به سالن، روی دکمه زیر بزنید! 👇"
    )

    # ساخت دکمه شیشه‌ای WebApp برای باز شدن مینی‌اپ داخل تلگرام
    markup = types.InlineKeyboardMarkup()
    web_app = types.WebAppInfo(url=WEBAPP_URL)
    btn_enter = types.InlineKeyboardButton(text="🏛️ Enter Grand Lounge", web_app=web_app)
    markup.add(btn_enter)

    bot.send_message(
        message.chat.id,
        welcome_text,
        parse_mode="Markdown",
        reply_markup=markup
    )

if __name__ == "__main__":
    print("🤖 Grand Board Telegram Bot is running live...")
    bot.infinity_polling()
