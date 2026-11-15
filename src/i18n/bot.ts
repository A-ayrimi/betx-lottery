import type { Locale } from "./config";

type BotStrings = {
  welcomeNew: string; // {name}
  welcomeBack: string; // {name}
  viaInvite: string;
  terms: string; // {url}
  open: string;
  myLink: string;
  balance: string;
  webLogin: string;
  inviteJoined: string; // {name} {count}
  inviteText: string; // {link} {bonus} {count}
  share: string;
  shareText: string;
  balanceText: string; // {balance} {spins}
  loginText: string;
  loginButton: string;
  loginSoon: string;
  help: string;
  winner: string; // {round} {prize} {serial}
  roundLost: string; // {round} {n} {serial}
  deposit: string; // {amount}
  buyTicket: string;
  refDeposit: string;
  wdPaid: string; // {amount}
  wdRejected: string; // {id}
  roundRefund: string; // {round} {hours} {n} {amount}
};

const S: Record<Locale, BotStrings> = {
  en: {
    welcomeNew: "🎟 <b>Welcome to BETX, {name}!</b>\n\nOne ticket. One chance. Instant USDT wins.\n\n• A <b>free wheel spin</b> every 24 hours\n• 20-ticket pool, <b>$15</b> to the winner\n• A friend's first golden-ticket purchase unlocks <b>+1 bonus spin</b>",
    welcomeBack: "👋 Welcome back, <b>{name}</b>!",
    viaInvite: "\n\n✅ You joined with a friend's invite.",
    terms: "\n\n<i>18+ only. By continuing you accept the Terms: {url}</i>",
    open: "🎰 Open BETX",
    myLink: "🔗 My invite link",
    balance: "💰 Balance",
    webLogin: "🌐 Log in on the web",
    inviteJoined: "🎉 <b>{name}</b> joined with your invite link!\nTheir first golden-ticket purchase unlocks +1 bonus spin for you.\nInvited so far: <b>{count}</b>",
    inviteText: "🔗 <b>Your personal invite link:</b>\n<code>{link}</code>\n\n• Each referred member's first golden-ticket purchase: +1 bonus spin\n• Their first deposit: +{bonus} cash\n\nInvited so far: <b>{count}</b>",
    share: "📤 Share with friends",
    shareText: "Join BETX with this link and get a free spin 🎟",
    balanceText: "💰 Balance: <b>{balance}</b>\n🎡 Bonus spins: <b>{spins}</b>",
    loginText: "🔐 This one-time link is valid for 10 minutes:",
    loginButton: "Log in to BETX",
    loginSoon: "🔌 Web login with Telegram is coming soon — for now, please open BETX and connect with your TRON wallet. 💰",
    help: "Use the buttons below 👇",
    winner: "🏆 <b>Congratulations! You won round {round} on BETX</b>\n\nWinning code: <code>{serial}</code>\n<b>{prize}</b> has been added to your balance.",
    roundLost: "🎟 Round {round} is complete. Your {n} ticket(s) did not win this time.\nWinning code: <code>{serial}</code>",
    deposit: "✅ Your deposit of <b>{amount}</b> is confirmed and credited.",
    buyTicket: "Buy a golden ticket",
    refDeposit: "🎁 Your friend made their first deposit — <b>invite reward</b> added to your balance.",
    wdPaid: "✅ Withdrawal of <b>{amount}</b> has been paid.",
    wdRejected: "↩️ Withdrawal #{id} was rejected and refunded to your balance.",
    roundRefund: "↩️ Round {round} didn't fill within {hours}h, so it was closed and your {n} ticket(s) were refunded: <b>{amount}</b> is back in your balance.",
  },
  es: {
    welcomeNew: "🎟 <b>¡Bienvenido a BETX, {name}!</b>\n\nUn boleto. Una oportunidad. Premios USDT al instante.\n\n• Un <b>giro gratis</b> cada 24 horas\n• Pozo de 20 boletos, <b>$15</b> al ganador\n• La primera compra de boleto dorado de un amigo desbloquea <b>+1 giro extra</b>",
    welcomeBack: "👋 ¡Bienvenido de nuevo, <b>{name}</b>!",
    viaInvite: "\n\n✅ Te uniste con la invitación de un amigo.",
    terms: "\n\n<i>Solo 18+. Al continuar aceptas los Términos: {url}</i>",
    open: "🎰 Abrir BETX",
    myLink: "🔗 Mi enlace",
    balance: "💰 Saldo",
    webLogin: "🌐 Entrar en la web",
    inviteJoined: "🎉 ¡<b>{name}</b> se unió con tu enlace!\nSu primera compra de boleto dorado desbloquea +1 giro para ti.\nInvitados: <b>{count}</b>",
    inviteText: "🔗 <b>Tu enlace personal:</b>\n<code>{link}</code>\n\n• Primera compra de boleto dorado de cada invitado: +1 giro\n• Su primer depósito: +{bonus} en efectivo\n\nInvitados: <b>{count}</b>",
    share: "📤 Compartir",
    shareText: "Únete a BETX con este enlace y gana un giro gratis 🎟",
    balanceText: "💰 Saldo: <b>{balance}</b>\n🎡 Giros extra: <b>{spins}</b>",
    loginText: "🔐 Este enlace de un solo uso es válido 10 minutos:",
    loginButton: "Entrar a BETX",
    loginSoon: "🔌 El acceso con Telegram estará disponible próximamente; por ahora abre BETX y conecta tu billetera TRON. 💰",
    help: "Usa los botones de abajo 👇",
    winner: "🏆 <b>¡Felicidades! Ganaste la ronda {round} en BETX</b>\n\nCódigo ganador: <code>{serial}</code>\n<b>{prize}</b> se añadieron a tu saldo.",
    roundLost: "🎟 La ronda {round} terminó. Tus {n} boleto(s) no ganaron esta vez.\nCódigo ganador: <code>{serial}</code>",
    deposit: "✅ Tu depósito de <b>{amount}</b> fue confirmado y acreditado.",
    buyTicket: "Comprar boleto dorado",
    refDeposit: "🎁 Tu amigo hizo su primer depósito — <b>recompensa</b> añadida a tu saldo.",
    wdPaid: "✅ Retiro de <b>{amount}</b> pagado.",
    wdRejected: "↩️ El retiro #{id} fue rechazado y reembolsado.",
    roundRefund: "↩️ La ronda {round} no se llenó en {hours} h, así que se cerró y tus {n} boleto(s) fueron reembolsados: <b>{amount}</b> vuelve a tu saldo.",
  },
  fa: {
    welcomeNew: "🎟 <b>به BETX خوش آمدی، {name}!</b>\n\nیک بلیط، یک شانس، برد آنی دلاری.\n\n• یک <b>چرخاندن رایگان</b> هر ۲۴ ساعت\n• استخر ۲۰ بلیطی، <b>۱۵ دلار</b> برای برنده\n• اولین خرید بلیط طلاییِ دوست دعوت‌شده، <b>۱ چرخش اضافه</b> آزاد می‌کند",
    welcomeBack: "👋 خوش برگشتی <b>{name}</b>!",
    viaInvite: "\n\n✅ با کد دعوت دوستت ثبت‌نام شدی.",
    terms: "\n\n<i>فقط ۱۸+. با ادامه، قوانین را می‌پذیری: {url}</i>",
    open: "🎰 ورود به BETX",
    myLink: "🔗 لینک دعوت من",
    balance: "💰 موجودی",
    webLogin: "🌐 ورود در مرورگر",
    inviteJoined: "🎉 <b>{name}</b> با لینک تو عضو شد!\nاولین خرید بلیط طلایی او، یک چرخش اضافه برایت آزاد می‌کند.\nدعوت‌شده‌ها: <b>{count}</b>",
    inviteText: "🔗 <b>لینک دعوت اختصاصی تو:</b>\n<code>{link}</code>\n\n• اولین خرید بلیط طلایی هر دعوت‌شده: +۱ چرخش\n• اولین واریز دوستت: +{bonus} نقدی\n\nدعوت‌شده‌ها: <b>{count}</b>",
    share: "📤 ارسال برای دوستان",
    shareText: "با این لینک وارد BETX شو و شانس رایگان بگیر 🎟",
    balanceText: "💰 موجودی: <b>{balance}</b>\n🎡 چرخاندن جایزه: <b>{spins}</b>",
    loginText: "🔐 این لینک یک‌بار مصرف است و ۱۰ دقیقه اعتبار دارد:",
    loginButton: "ورود به BETX",
    loginSoon: "🔌 ورود با تلگرام به‌زودی فعال می‌شود — فعلاً وارد BETX شو و با کیف پول ترون وصل شو. 💰",
    help: "از دکمه‌های زیر استفاده کن 👇",
    winner: "🏆 <b>تبریک! برنده دور {round} BETX شدی</b>\n\nکد برنده: <code>{serial}</code>\n<b>{prize}</b> به موجودی‌ات اضافه شد.",
    roundLost: "🎟 دور {round} تمام شد. {n} بلیط تو این بار برنده نشد.\nکد برنده: <code>{serial}</code>",
    deposit: "✅ واریز <b>{amount}</b> تأیید و به کیف پولت اضافه شد.",
    buyTicket: "خرید بلیط طلایی",
    refDeposit: "🎁 دوستت اولین واریزش را انجام داد — <b>پاداش دعوت</b> به موجودی‌ات اضافه شد.",
    wdPaid: "✅ برداشت <b>{amount}</b> پرداخت شد.",
    wdRejected: "↩️ درخواست برداشت #{id} رد شد و مبلغ به موجودی‌ات برگشت.",
    roundRefund: "↩️ دور {round} در {hours} ساعت تکمیل نشد، پس بسته شد و {n} بلیط تو بازپرداخت شد: <b>{amount}</b> به موجودی‌ات برگشت.",
  },
  ar: {
    welcomeNew: "🎟 <b>مرحباً بك في BETX يا {name}!</b>\n\nتذكرة واحدة. فرصة واحدة. أرباح USDT فورية.\n\n• <b>دورة مجانية</b> كل 24 ساعة\n• مجمّع من 20 تذكرة، <b>15$</b> للفائز\n• أول شراء لتذكرة ذهبية من صديق مدعو يفتح <b>دورة إضافية</b>",
    welcomeBack: "👋 مرحباً بعودتك يا <b>{name}</b>!",
    viaInvite: "\n\n✅ انضممت بدعوة من صديق.",
    terms: "\n\n<i>18+ فقط. بالمتابعة توافق على الشروط: {url}</i>",
    open: "🎰 افتح BETX",
    myLink: "🔗 رابط دعوتي",
    balance: "💰 الرصيد",
    webLogin: "🌐 الدخول من المتصفح",
    inviteJoined: "🎉 انضم <b>{name}</b> عبر رابطك!\nأول شراء لتذكرة ذهبية منه يفتح لك دورة إضافية.\nالمدعوون: <b>{count}</b>",
    inviteText: "🔗 <b>رابط دعوتك الشخصي:</b>\n<code>{link}</code>\n\n• أول شراء لتذكرة ذهبية من كل مدعو: +1 دورة\n• أول إيداع له: +{bonus} نقداً\n\nالمدعوون: <b>{count}</b>",
    share: "📤 شارك مع الأصدقاء",
    shareText: "انضم إلى BETX بهذا الرابط واحصل على دورة مجانية 🎟",
    balanceText: "💰 الرصيد: <b>{balance}</b>\n🎡 دورات إضافية: <b>{spins}</b>",
    loginText: "🔐 هذا الرابط صالح لمرة واحدة ولمدة 10 دقائق:",
    loginButton: "الدخول إلى BETX",
    loginSoon: "🔌 الدخول عبر تيليجرام قريباً — حالياً افتح BETX واتصل بمحفظة TRON. 💰",
    help: "استخدم الأزرار أدناه 👇",
    winner: "🏆 <b>تهانينا! فزت بالجولة {round} في BETX</b>\n\nالرمز الفائز: <code>{serial}</code>\nأُضيف <b>{prize}</b> إلى رصيدك.",
    roundLost: "🎟 انتهت الجولة {round}. لم تفز تذاكرك ({n}) هذه المرة.\nالرمز الفائز: <code>{serial}</code>",
    deposit: "✅ تم تأكيد إيداعك بقيمة <b>{amount}</b> وإضافته.",
    buyTicket: "اشترِ تذكرة ذهبية",
    refDeposit: "🎁 قام صديقك بأول إيداع — أُضيفت <b>مكافأة الدعوة</b> إلى رصيدك.",
    wdPaid: "✅ تم دفع سحب بقيمة <b>{amount}</b>.",
    wdRejected: "↩️ رُفض طلب السحب #{id} وأُعيد المبلغ إلى رصيدك.",
    roundRefund: "↩️ لم تمتلئ الجولة {round} خلال {hours} ساعة، فأُغلقت وأُعيد ثمن تذاكرك ({n}): عاد <b>{amount}</b> إلى رصيدك.",
  },
  tr: {
    welcomeNew: "🎟 <b>BETX'e hoş geldin, {name}!</b>\n\nTek bilet. Tek şans. Anında USDT kazanç.\n\n• Her 24 saatte bir <b>ücretsiz çark</b>\n• 20 biletlik havuz, kazanana <b>15$</b>\n• Davet edilen arkadaşının ilk altın bilet alımı <b>+1 bonus çevirme</b> açar",
    welcomeBack: "👋 Tekrar hoş geldin, <b>{name}</b>!",
    viaInvite: "\n\n✅ Bir arkadaşının davetiyle katıldın.",
    terms: "\n\n<i>Yalnızca 18+. Devam ederek Şartları kabul edersin: {url}</i>",
    open: "🎰 BETX'i aç",
    myLink: "🔗 Davet bağlantım",
    balance: "💰 Bakiye",
    webLogin: "🌐 Web'de giriş yap",
    inviteJoined: "🎉 <b>{name}</b> davet bağlantınla katıldı!\nİlk altın bilet alımı sana +1 bonus çevirme açar.\nDavet edilen: <b>{count}</b>",
    inviteText: "🔗 <b>Kişisel davet bağlantın:</b>\n<code>{link}</code>\n\n• Her davetlinin ilk altın bilet alımı: +1 bonus çevirme\n• İlk yatırımı: +{bonus} nakit\n\nDavet edilen: <b>{count}</b>",
    share: "📤 Arkadaşlarla paylaş",
    shareText: "Bu bağlantıyla BETX'e katıl ve ücretsiz çevirme kazan 🎟",
    balanceText: "💰 Bakiye: <b>{balance}</b>\n🎡 Bonus çevirme: <b>{spins}</b>",
    loginText: "🔐 Bu tek kullanımlık bağlantı 10 dakika geçerlidir:",
    loginButton: "BETX'e giriş yap",
    loginSoon: "🔌 Telegram ile giriş yakında aktif olacak — şimdilik BETX'i aç ve TRON cüzdanınla bağlan. 💰",
    help: "Aşağıdaki düğmeleri kullan 👇",
    winner: "🏆 <b>Tebrikler! BETX'te {round}. turu kazandın</b>\n\nKazanan kod: <code>{serial}</code>\n<b>{prize}</b> bakiyene eklendi.",
    roundLost: "🎟 {round}. tur tamamlandı. {n} biletin bu kez kazanmadı.\nKazanan kod: <code>{serial}</code>",
    deposit: "✅ <b>{amount}</b> yatırımın onaylandı ve eklendi.",
    buyTicket: "Altın bilet al",
    refDeposit: "🎁 Arkadaşın ilk yatırımını yaptı — <b>davet ödülü</b> bakiyene eklendi.",
    wdPaid: "✅ <b>{amount}</b> çekimin ödendi.",
    wdRejected: "↩️ #{id} çekimi reddedildi ve bakiyene iade edildi.",
    roundRefund: "↩️ {round}. tur {hours} saat içinde dolmadığı için kapatıldı ve {n} biletin iade edildi: <b>{amount}</b> bakiyene döndü.",
  },
  ru: {
    welcomeNew: "🎟 <b>Добро пожаловать в BETX, {name}!</b>\n\nОдин билет. Один шанс. Мгновенный выигрыш в USDT.\n\n• <b>Бесплатное вращение</b> каждые 24 часа\n• Пул на 20 билетов, <b>$15</b> победителю\n• Первая покупка золотого билета приглашённым другом открывает <b>+1 бонусное вращение</b>",
    welcomeBack: "👋 С возвращением, <b>{name}</b>!",
    viaInvite: "\n\n✅ Ты присоединился по приглашению друга.",
    terms: "\n\n<i>Только 18+. Продолжая, ты принимаешь Условия: {url}</i>",
    open: "🎰 Открыть BETX",
    myLink: "🔗 Моя ссылка",
    balance: "💰 Баланс",
    webLogin: "🌐 Войти на сайте",
    inviteJoined: "🎉 <b>{name}</b> присоединился по твоей ссылке!\nПервая покупка золотого билета откроет тебе +1 бонусное вращение.\nПриглашено: <b>{count}</b>",
    inviteText: "🔗 <b>Твоя личная ссылка:</b>\n<code>{link}</code>\n\n• Первая покупка золотого билета каждым приглашённым: +1 вращение\n• Его первое пополнение: +{bonus} наличными\n\nПриглашено: <b>{count}</b>",
    share: "📤 Поделиться",
    shareText: "Заходи в BETX по этой ссылке и получи бесплатное вращение 🎟",
    balanceText: "💰 Баланс: <b>{balance}</b>\n🎡 Бонусные вращения: <b>{spins}</b>",
    loginText: "🔐 Одноразовая ссылка действует 10 минут:",
    loginButton: "Войти в BETX",
    loginSoon: "🔌 Вход через Telegram скоро появится — пока откройте BETX и подключите TRON-кошелёк. 💰",
    help: "Используй кнопки ниже 👇",
    winner: "🏆 <b>Поздравляем! Ты выиграл раунд {round} в BETX</b>\n\nВыигрышный код: <code>{serial}</code>\n<b>{prize}</b> зачислено на баланс.",
    roundLost: "🎟 Раунд {round} завершён. Твои билеты ({n}) в этот раз не выиграли.\nВыигрышный код: <code>{serial}</code>",
    deposit: "✅ Пополнение на <b>{amount}</b> подтверждено и зачислено.",
    buyTicket: "Купить золотой билет",
    refDeposit: "🎁 Твой друг сделал первое пополнение — <b>награда</b> зачислена.",
    wdPaid: "✅ Вывод <b>{amount}</b> выплачен.",
    wdRejected: "↩️ Вывод #{id} отклонён, средства возвращены.",
    roundRefund: "↩️ Раунд {round} не заполнился за {hours} ч, поэтому закрыт, а твои билеты ({n}) возвращены: <b>{amount}</b> снова на балансе.",
  },
};

export const botStrings = (l: Locale | string | null | undefined) =>
  S[(l && l in S ? l : "en") as Locale];
