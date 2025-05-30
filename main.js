const TelegramBot = require('node-telegram-bot-api');
const sdk = require('node-appwrite');
const Calendar = require('telegram-inline-calendar'); // Перемістив сюди для узгодженості

// Ці змінні будуть встановлені через Appwrite Function settings
const BOT_TOKEN = process.env.BOT_TOKEN;
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const APPWRITE_APPOINTMENTS_COLLECTION_ID =
    process.env.APPWRITE_APPOINTMENTS_COLLECTION_ID;
const APPWRITE_DISABLED_DATES_COLLECTION_ID =
    process.env.APPWRITE_DISABLED_DATES_COLLECTION_ID;
const APPWRITE_BLOCKED_SLOTS_COLLECTION_ID =
    process.env.APPWRITE_BLOCKED_SLOTS_COLLECTION_ID;
const APPWRITE_BLACKLIST_COLLECTION_ID =
    process.env.APPWRITE_BLACKLIST_COLLECTION_ID;

// Ініціалізація бота БЕЗ polling
const bot = new TelegramBot(BOT_TOKEN);

const client = new sdk.Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new sdk.Databases(client);

const services = [
    {
        id: '0',
        name: 'Манікюр Complex “Lite”',
        description: 'Манікюр, укріплення, покриття в один тон',
        price: 600,
    },
    {
        id: '1',
        name: 'Манікюр Complex “Medium”',
        description:
            'Манікюр, укріплення, легкий дизайн або дизайн на декілька пальців',
        price: 650,
    },
    {
        id: '2',
        name: 'Манікюр Complex “Hard”',
        description:
            'Манікюр, укріплення, підняття клюючих нігтів/донарощування, важкий дизайн або дизайн на всі нігті',
        price: 700,
    },
    {
        id: '3',
        name: 'Манікюр без покриття',
        description: null,
        price: 300,
    },
    {
        id: '4',
        name: 'Зняття покриття',
        description:
            'Зняття старого покриття (без послідуючого покриття), опил форми',
        price: 100,
    },
    {
        id: '5',
        name: 'Нарощування Complex “Lite”',
        description:
            'Манікюр, нарощування будь якої довжини, покриття в один тон',
        price: 800,
    },
    {
        id: '6',
        name: 'Нарощування Complex “Medium”',
        description:
            'Манікюр, нарощування будь якої довжини, легкий дизайн або дизайн на декілька пальців',
        price: 900,
    },
    {
        id: '7',
        name: 'Нарощування Complex “Hard”',
        description:
            'Манікюр, нарощування або нарощування екстримальної довжини, покриття, важкий дизайн або дизайн на всі нігті',
        price: 1000,
    },
    {
        id: '8',
        name: 'Корекція нарощування',
        description: 'Манікюр, корекція нарощування, покриття в один тон',
        price: 700,
    },
    {
        id: '9',
        name: 'Зняття нарощування',
        description: null,
        price: 200,
    },
    {
        id: '10',
        name: 'Педикюр Complex “Lite”',
        description: 'Обробка пальчиків та стопи без покриття',
        price: 500,
    },
    {
        id: '11',
        name: 'Педикюр Complex “Medium”',
        description: 'Обробка пальчиків без стопи, покриття, дизайн',
        price: 600,
    },
    {
        id: '12',
        name: 'Педикюр Complex “Hard”',
        description: 'Обробка пальчиків та стопи, покриття, дизайн',
        price: 700,
    },
];

const getServicesList = () => {
    const serviceList = services.map(
        (service) =>
            `<b>${service.name}</b>\n${
                service.description ? service.description + '\n' : ''
            }Ціна: <b>${service.price}</b> грн`
    );
    return serviceList.join('\n\n');
};

// УВАГА: userState та selectedServices будуть проблемою в stateless середовищі Appwrite Functions!
// Ці об'єкти будуть скидатися при кожному виклику функції (кожному новому повідомленні).
// Для правильної роботи багатоетапних діалогів вам потрібно буде зберігати стан
// користувача в базі даних Appwrite (наприклад, в окремій колекції user_sessions).
// Поки що залишаємо їх, щоб код був максимально схожий на ваш оригінал,
// але це потребуватиме ОБОВ'ЯЗКОВОГО рефакторингу для коректної роботи.
let userState = {};
let selectedServices = {};

const getDisabledDates = async () => {
    try {
        const response = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            APPWRITE_DISABLED_DATES_COLLECTION_ID
        );
        return response.documents;
    } catch (error) {
        console.error('Error fetching disabled dates:', error);
        throw error; // Важливо кидати помилку далі або обробляти її належним чином
    }
};

// bot.setMyCommands - краще встановити один раз через BotFather або окремим скриптом.
// Якщо викликати тут, команди будуть встановлюватися при кожному виклику функції, що не є оптимальним.
/*
bot.setMyCommands([
    { command: '/main_menu', description: 'Головне меню' },
    { command: '/services', description: 'Послуги' },
    { command: '/booking', description: 'Перейти до запису' },
    { command: '/my_appointments', description: 'Мої записи' },
    { command: '/cancel', description: 'Скасувати запис' },
    { command: '/info', description: 'Контакти та адреса' },
]);
*/

const sendOptions = (chatId, messageText, options) => {
    bot.sendMessage(chatId, messageText, {
        reply_markup: {
            keyboard: options,
            one_time_keyboard: true,
            resize_keyboard: true,
        },
        parse_mode: 'HTML',
    });
};

const getBlockedTimes = async (date, collectionId) => {
    try {
        const response = await databases.listDocuments(
            APPWRITE_DATABASE_ID,
            collectionId,
            [sdk.Query.equal('date', date)]
        );
        return response.documents.map((doc) => doc.time);
    } catch (error) {
        console.error('Помилка при отриманні заблокованих слотів:', error);
        return []; // Повертаємо порожній масив у разі помилки, щоб не переривати логіку
    }
};

const createServiceKeyboard = (chatId, includeSubmit = false) => {
    const keyboard = services.map((service) => {
        // Перевірка, чи selectedServices[chatId] існує
        const isSelected =
            selectedServices[chatId] && selectedServices[chatId][service.id];
        const checkbox = isSelected ? '✅' : '⬜';

        return [
            {
                text: `${checkbox} ${service.name}`,
                callback_data: `toggle_${service.id}`,
            },
        ];
    });

    if (includeSubmit) {
        keyboard.push([
            {
                text: 'Записатися', // Можливо, краще "Обрати дату і час" або "Далі"
                callback_data: 'services_confirm',
            },
        ]);
    }

    return {
        inline_keyboard: keyboard,
    };
};

const getTomorrowDay = () => {
    let tomorrowDay = new Date();
    tomorrowDay.setDate(tomorrowDay.getDate() + 1);
    // Appwrite functions за замовчуванням в UTC.
    // Якщо клієнти в Україні, це може призвести до того, що "завтра" настане раніше для сервера.
    // Для простоти поки залишаємо так, але це потенційне місце для покращення з урахуванням часових поясів.
    return tomorrowDay.toISOString().split('T')[0];
};

const getStopDay = () => {
    let stopDay = new Date();
    stopDay.setMonth(stopDay.getMonth() + 2);
    return stopDay.toISOString().split('T')[0];
};

const calendar = new Calendar(bot, {
    date_format: 'YYYY-MM-DD',
    start_week_day: 1,
    start_date: getTomorrowDay(),
    stop_date: getStopDay(),
    language: 'uk',
});

bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ініціалізація стану для поточного chatId, ЯКЩО ЙОГО НЕМАЄ.
    // Це ТИМЧАСОВЕ РІШЕННЯ, яке НЕ буде правильно працювати для послідовних кроків
    // у stateless середовищі без зберігання стану в БД!
    if (!userState[chatId]) {
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        };
    }
    if (!selectedServices[chatId]) {
        selectedServices[chatId] = {};
    }

    if (text === '/start') {
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        };
        selectedServices[chatId] = {};
        sendOptions(
            chatId,
            '<b>Вітаю!</b> Я бот для запису на послуги манікюру та педікюру. Оберіть команду з меню, щоб продовжити.',
            [
                ['Послуги', 'Запис', 'Мої записи'],
                ['Скасувати запис', 'Контакти та адреса'],
            ]
        );
    } else if (text === '/main_menu' || text === 'Головне меню') {
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        };
        selectedServices[chatId] = {};
        sendOptions(chatId, 'Оберіть команду з меню, щоб продовжити.', [
            ['Послуги', 'Запис', 'Мої записи'],
            ['Скасувати запис', 'Контакти та адреса'],
        ]);
    } else if (text === '/services' || text === 'Послуги') {
        sendOptions(chatId, `Послуги:\n\n${getServicesList()}`, [
            ['Головне меню', 'Запис'],
        ]);
    } else if (text === '/booking' || text === 'Запис') {
        selectedServices[chatId] = {}; // Скидаємо вибір послуг перед новим записом
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        }; // Скидаємо весь стан
        bot.sendMessage(chatId, 'Оберіть послугу (або декілька):', {
            reply_markup: createServiceKeyboard(chatId, true),
        });
    } else if (text === 'Обрати дату') {
        // Перевірка, чи обрані послуги (приклад того, як можна було б контролювати стан)
        if (
            !userState[chatId] ||
            !userState[chatId].selectedServices ||
            userState[chatId].selectedServices.length === 0
        ) {
            bot.sendMessage(
                chatId,
                'Будь ласка, спочатку оберіть послуги, натиснувши "Запис".'
            );
            return;
        }
        calendar.startNavCalendar(msg);
    } else if (text === 'Обрати час') {
        if (!userState[chatId] || !userState[chatId].selectedDate) {
            bot.sendMessage(chatId, 'Будь ласка, спочатку оберіть дату.');
            return;
        }
        let hours = [
            '11:00',
            '12:00',
            '13:00',
            '14:00',
            '15:00',
            '16:00',
            '17:00',
            '18:00',
        ];

        const bookedTimes = await getBlockedTimes(
            userState[chatId].selectedDate,
            APPWRITE_APPOINTMENTS_COLLECTION_ID
        );
        const blockedTimesByAdmin = await getBlockedTimes(
            userState[chatId].selectedDate,
            APPWRITE_BLOCKED_SLOTS_COLLECTION_ID
        );

        const allBlockedTimes = [
            ...new Set([...bookedTimes, ...blockedTimesByAdmin]),
        ]; // Об'єднуємо та видаляємо дублікати

        const availableTimes = hours.filter(
            (time) => !allBlockedTimes.includes(time)
        );

        if (availableTimes.length > 0) {
            bot.sendMessage(chatId, 'Оберіть час:', {
                reply_markup: {
                    inline_keyboard: availableTimes.map((time) => [
                        { text: time, callback_data: `time_${time}` },
                    ]),
                },
            });
        } else {
            sendOptions(
                chatId,
                'На жаль, на цю дату немає вільних місць. Будь ласка, оберіть іншу дату.',
                [['Обрати дату']]
            );
        }
    } else if (text === 'Підтвердити час') {
        if (
            !userState[chatId] ||
            !userState[chatId].selectedServices ||
            userState[chatId].selectedServices.length === 0 ||
            !userState[chatId].selectedDate ||
            !userState[chatId].selectedTime
        ) {
            sendOptions(
                chatId,
                'Щось пішло не так. Не всі дані обрано. Будь ласка, почніть запис спочатку командою /booking.',
                [['/booking', 'Головне меню']]
            );
            return;
        }
        sendOptions(
            chatId,
            `Переконайтесь, що все вірно і натисніть "Записатись" для підтвердження запису.

Послуги: ${userState[chatId].selectedServices.join(', ')}
Дата: ${userState[chatId].selectedDate}
Час: ${userState[chatId].selectedTime}`,
            [['Записатись'], ['Головне меню']]
        );
    } else if (text === 'Записатись') {
        if (
            !userState[chatId] ||
            !userState[chatId].selectedServices ||
            userState[chatId].selectedServices.length === 0 ||
            !userState[chatId].selectedDate ||
            !userState[chatId].selectedTime
        ) {
            sendOptions(
                chatId,
                'Не всі дані для запису обрано. Будь ласка, почніть запис спочатку командою /booking.',
                [['/booking', 'Головне меню']]
            );
            return;
        }

        const currentUsername = msg.from.username
            ? `@${msg.from.username}`
            : null;
        if (!currentUsername) {
            sendOptions(
                chatId,
                "Для запису потрібне ім'я користувача (username) в Telegram. Будь ласка, встановіть його в налаштуваннях Telegram та спробуйте знову.",
                [['Головне меню']]
            );
            return;
        }

        userState[chatId].name = msg.from.first_name || 'Користувач'; // Використовуємо first_name, якщо є
        userState[chatId].phone = currentUsername;

        try {
            const blacklistResponse = await databases.listDocuments(
                APPWRITE_DATABASE_ID,
                APPWRITE_BLACKLIST_COLLECTION_ID,
                [sdk.Query.equal('userName', currentUsername)] // Припускаємо, що в чорному списку зберігається userName з @
            );

            if (blacklistResponse.documents.length > 0) {
                sendOptions(
                    chatId,
                    'Ви в чорному списку і не можете записатись на послуги. Зверніться до @hele_nails для вирішення питання.',
                    [['Головне меню']]
                );
                return; // Важливо вийти з функції тут
            }

            // Створення запису
            await databases.createDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_APPOINTMENTS_COLLECTION_ID,
                'unique()',
                {
                    name: userState[chatId].name,
                    phone: userState[chatId].phone, // Це Telegram username
                    date: userState[chatId].selectedDate,
                    time: userState[chatId].selectedTime,
                    selectedServices: userState[chatId].selectedServices, // Масив рядків
                    chatId: String(chatId), // chatId краще зберігати як рядок
                }
            );

            sendOptions(
                chatId,
                `Ваш запис підтверджено!

Ім'я: ${userState[chatId].name}
Телеграм: ${userState[chatId].phone}
Послуги: ${userState[chatId].selectedServices.join(', ')}
Дата: ${userState[chatId].selectedDate}
Час: ${userState[chatId].selectedTime}

Вам надійде повідомлення-нагадування за добу до призначеного часу.`,
                [['Головне меню']]
            );
            // Скидання стану після успішного запису
            userState[chatId] = {
                selectedServices: [],
                selectedDate: null,
                selectedTime: null,
            };
            selectedServices[chatId] = {};
        } catch (error) {
            console.error(
                'Помилка при записі або перевірці чорного списку:',
                error
            );
            sendOptions(
                chatId,
                'Помилка при спробі запису. Можливо, ви вже записані на цей час, або виникла інша проблема. Спробуйте ще раз або зверніться до адміністратора.',
                [['/booking'], ['Головне меню']]
            );
        }
    } else if (text === '/my_appointments' || text === 'Мої записи') {
        const username = msg.from.username ? `@${msg.from.username}` : null;
        if (!username) {
            sendOptions(
                chatId,
                "Для перегляду записів потрібне ім'я користувача (username) в Telegram. Будь ласка, встановіть його в налаштуваннях Telegram.",
                [['Головне меню']]
            );
            return;
        }
        try {
            const response = await databases.listDocuments(
                APPWRITE_DATABASE_ID,
                APPWRITE_APPOINTMENTS_COLLECTION_ID,
                [sdk.Query.equal('phone', username)] // 'phone' зберігає username
            );

            const futureAppointments = response.documents.filter((doc) => {
                // Створюємо об'єкт Date з дати та часу. Припускаємо, що час у форматі HH:MM
                const [hours, minutes] = doc.time.split(':');
                const appointmentDate = new Date(doc.date);
                appointmentDate.setHours(
                    parseInt(hours, 10),
                    parseInt(minutes, 10),
                    0,
                    0
                );
                return appointmentDate > new Date(); // Порівнюємо з поточним часом
            });

            if (futureAppointments.length > 0) {
                let appointmentsMessage = 'Ваші майбутні записи:\n\n';
                futureAppointments.forEach((document) => {
                    appointmentsMessage += `Послуги: ${document.selectedServices.join(
                        ', '
                    )}\nДата: ${document.date}, Час: ${document.time}\n\n`;
                });
                bot.sendMessage(chatId, appointmentsMessage);
                // setTimeout не працюватиме надійно у stateless функції.
                // Краще надати опцію одразу або через команду /cancel
                sendOptions(
                    chatId,
                    'Якщо ви хочете скасувати запис, використайте команду /cancel або кнопку нижче.',
                    [['Скасувати запис'], ['Головне меню']]
                );
            } else {
                sendOptions(
                    chatId,
                    'У вас немає майбутніх записів. Хочете записатись на послугу?',
                    [['Запис'], ['Головне меню']]
                );
            }
        } catch (error) {
            console.error('Помилка при отриманні записів:', error);
            sendOptions(
                chatId,
                'Помилка при отриманні записів. Спробуйте ще раз.',
                [['Мої записи'], ['Головне меню']]
            );
        }
    } else if (text === '/cancel' || text === 'Скасувати запис') {
        const username = msg.from.username ? `@${msg.from.username}` : null;
        if (!username) {
            sendOptions(
                chatId,
                "Для скасування записів потрібне ім'я користувача (username) в Telegram.",
                [['Головне меню']]
            );
            return;
        }
        try {
            const response = await databases.listDocuments(
                APPWRITE_DATABASE_ID,
                APPWRITE_APPOINTMENTS_COLLECTION_ID,
                [sdk.Query.equal('phone', username)] // 'phone' зберігає username
            );

            const futureAppointments = response.documents.filter((doc) => {
                const [hours, minutes] = doc.time.split(':');
                const appointmentDate = new Date(doc.date);
                appointmentDate.setHours(
                    parseInt(hours, 10),
                    parseInt(minutes, 10),
                    0,
                    0
                );
                return appointmentDate > new Date();
            });

            if (futureAppointments.length > 0) {
                futureAppointments.forEach((document) => {
                    bot.sendMessage(
                        chatId,
                        `Ваш запис для можливого скасування:\nПослуги: ${document.selectedServices.join(
                            ', '
                        )}\nДата: ${document.date}, Час: ${document.time}.`,
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: 'Скасувати цей запис',
                                            callback_data: `cancel_${document.$id}`,
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                });
                // setTimeout тут теж недоречний
                sendOptions(
                    chatId,
                    'Оберіть запис для скасування зі списку вище, або поверніться в головне меню.',
                    [['Головне меню']]
                );
            } else {
                sendOptions(
                    chatId,
                    'У вас немає майбутніх записів для скасування.',
                    [['Запис'], ['Головне меню']]
                );
            }
        } catch (error) {
            console.error(
                'Помилка при отриманні записів для скасування:',
                error
            );
            sendOptions(
                chatId,
                'Помилка при отриманні ваших записів для скасування. Спробуйте ще раз.',
                [['Скасувати запис'], ['Головне меню']]
            );
        }
    } else if (text === '/info' || text === 'Контакти та адреса') {
        sendOptions(
            chatId,
            `<b>PH Nails Studio</b>

Сайт: https://ph-nails-studio.vercel.app/
Адреса: вулиця Георгія Тарасенка, 57А

По всім питанням можна звернутись в телеграм: @hele_nails.
Або в дірект інстаграм: https://www.instagram.com/hele_nails.kh/`,
            [['Головне меню'], ['Запис']]
        );
    } else {
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        };
        selectedServices[chatId] = {};
        sendOptions(
            chatId,
            'Я не розумію команду, будь ласка оберіть команду з меню.',
            [
                ['Послуги', 'Запис', 'Мої записи'],
                ['Скасувати запис', 'Контакти та адреса'],
            ]
        );
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    // Ініціалізація стану - ТИМЧАСОВЕ РІШЕННЯ!
    if (!userState[chatId])
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        };
    if (!selectedServices[chatId]) selectedServices[chatId] = {};

    if (data.startsWith('toggle_')) {
        const serviceId = data.split('_')[1];
        selectedServices[chatId][serviceId] =
            !selectedServices[chatId][serviceId];

        const updatedKeyboard = createServiceKeyboard(chatId, true);
        try {
            await bot.editMessageReplyMarkup(updatedKeyboard, {
                chat_id: chatId,
                message_id: messageId,
            });
        } catch (e) {
            console.warn(
                'Could not edit message reply markup for toggle, maybe message is too old or no change:',
                e.message
            );
        }
        bot.answerCallbackQuery(query.id);
    } else if (data === 'services_confirm') {
        const chosenServicesIds = selectedServices[chatId]
            ? Object.keys(selectedServices[chatId]).filter(
                  (key) => selectedServices[chatId][key]
              )
            : [];

        const chosenServicesNames = chosenServicesIds
            .map((id) => services.find((s) => s.id === id)?.name)
            .filter((name) => name); // Масив імен

        if (chosenServicesNames.length > 0) {
            userState[chatId] = {
                ...userState[chatId], // Зберігаємо попередній стан, якщо є
                selectedServices: chosenServicesNames, // Оновлюємо тільки обрані послуги
            };
            sendOptions(
                chatId,
                `Ви обрали наступні послуги: ${chosenServicesNames.join(
                    ', '
                )}. Тепер оберіть дату.`,
                [['Обрати дату']]
            );
        } else {
            bot.sendMessage(
                chatId,
                'Ви не обрали жодної послуги. Будь ласка, спробуйте ще раз.'
            );
            // Можна повторно показати клавіатуру вибору послуг
            // bot.sendMessage(chatId, 'Оберіть послугу (або декілька):', {
            //     reply_markup: createServiceKeyboard(chatId, true),
            // });
        }
        try {
            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { chat_id: chatId, message_id: messageId }
            );
        } catch (e) {
            console.warn(
                'Could not edit message reply markup for services_confirm:',
                e.message
            );
        }
        bot.answerCallbackQuery(query.id);
        // selectedServices[chatId] буде очищено при наступному /booking
    } else if (data.startsWith('n_20')) {
        // Обробка календаря
        try {
            const disabledDocs = await getDisabledDates();
            const disabledDates = disabledDocs.map((doc) => doc.date);

            // clickButtonCalendar може повернути undefined, якщо це не вибір дати (напр. навігація)
            const selectedDateValue = calendar.clickButtonCalendar(query);

            if (selectedDateValue) {
                // Якщо дата була обрана (не просто навігація)
                if (disabledDates.includes(selectedDateValue)) {
                    bot.answerCallbackQuery(query.id, {
                        text: 'Ця дата недоступна, оберіть іншу.',
                        show_alert: true,
                    });
                    // Не потрібно знову показувати календар, якщо дата недійсна, користувач сам обере
                } else {
                    // Якщо це не навігація по місяцях/роках, а саме вибір дати
                    if (
                        !data.includes('_+') &&
                        !data.includes('_-') &&
                        !data.startsWith('n_20w_') &&
                        data !== 'n_20yc' &&
                        data !== 'n_20mc'
                    ) {
                        userState[chatId] = {
                            ...userState[chatId],
                            selectedDate: selectedDateValue,
                        };
                        sendOptions(
                            chatId,
                            `Ви обрали дату: ${selectedDateValue}. Тепер оберіть час.`,
                            [['Обрати час'], ['Головне меню']]
                        );
                        try {
                            await bot.editMessageReplyMarkup(
                                { inline_keyboard: [] },
                                { chat_id: chatId, message_id: messageId }
                            );
                        } catch (e) {
                            console.warn(
                                'Could not edit calendar message:',
                                e.message
                            );
                        }
                        bot.answerCallbackQuery(query.id);
                    } else {
                        bot.answerCallbackQuery(query.id); // Відповідь на навігаційні кліки
                    }
                }
            } else {
                bot.answerCallbackQuery(query.id); // Якщо clickButtonCalendar нічого не повернув (навігація)
            }
        } catch (error) {
            console.error('Error processing calendar callback:', error);
            bot.answerCallbackQuery(query.id, {
                text: 'Помилка обробки календаря.',
                show_alert: true,
            });
        }
    } else if (data.startsWith('time_')) {
        const selectedTimeValue = data.split('_')[1];
        userState[chatId] = {
            ...userState[chatId],
            selectedTime: selectedTimeValue,
        };

        if (!userState[chatId].selectedDate) {
            // Перевірка, чи була обрана дата
            sendOptions(chatId, 'Будь ласка, спочатку оберіть дату.', [
                ['Обрати дату'],
                ['Головне меню'],
            ]);
            bot.answerCallbackQuery(query.id);
            return;
        }

        sendOptions(
            chatId,
            `Ви обрали: ${userState[chatId].selectedDate}, ${selectedTimeValue}. Підтвердити цей час?`,
            [['Підтвердити час'], ['Обрати час']]
        );
        try {
            await bot.editMessageReplyMarkup(
                { inline_keyboard: [] },
                { chat_id: chatId, message_id: messageId }
            );
        } catch (e) {
            console.warn('Could not edit time selection message:', e.message);
        }
        bot.answerCallbackQuery(query.id);
    } else if (data.startsWith('cancel_')) {
        const appointmentId = data.split('_')[1];
        try {
            await databases.deleteDocument(
                APPWRITE_DATABASE_ID,
                APPWRITE_APPOINTMENTS_COLLECTION_ID,
                appointmentId
            );
            try {
                await bot.editMessageText(
                    `Запис скасовано.\nЯкщо ви хочете записатись знову, натисніть кнопку нижче.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: { inline_keyboard: [] },
                    }
                );
            } catch (e) {
                console.warn(
                    'Could not edit cancellation message text:',
                    e.message
                );
                // Якщо редагування не вдалося, надсилаємо нове повідомлення
                bot.sendMessage(
                    chatId,
                    'Запис скасовано. Якщо ви хочете записатись знову, натисніть кнопку нижче.'
                );
            }

            sendOptions(chatId, 'Оберіть дію:', [['Запис'], ['Головне меню']]);
            bot.answerCallbackQuery(query.id, {
                text: 'Запис скасовано успішно!',
            });
        } catch (error) {
            console.error('Помилка при скасуванні запису:', error);
            bot.sendMessage(
                chatId,
                'Помилка при скасуванні запису. Спробуйте ще раз.'
            );
            bot.answerCallbackQuery(query.id, {
                text: 'Помилка скасування запису.',
                show_alert: true,
            });
        }
    } else {
        // Обробка невідомих callback_data
        bot.answerCallbackQuery(query.id, { text: 'Невідома дія.' });
    }
});

// Головна функція, яку Appwrite буде викликати
module.exports = async (req, res) => {
    try {
        // Appwrite передає дані запиту в req.body (якщо це POST з JSON)
        // або req.payload для деяких типів тригерів (але для HTTP webhook це req.body)
        const update = JSON.parse(req.body); // Telegram надсилає JSON, Appwrite може передати його як рядок
        bot.processUpdate(update);
        res.json({ status: 'ok', message: 'Update processed' }); // Відповідь для Telegram
    } catch (error) {
        console.error('Error processing update in Appwrite function:', error);
        console.error('Request body was:', req.body); // Логуємо тіло запиту для дебагу
        res.json({ status: 'error', message: 'Failed to process update' }, 500);
    }
};
