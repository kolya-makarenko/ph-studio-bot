const TelegramBot = require('node-telegram-bot-api');
const sdk = require('node-appwrite');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true,
});

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID;
const appointmentsCollectionId =
    process.env.APPWRITE_APPOINTMENTS_COLLECTION_ID;
const disabledDatesCollectionId =
    process.env.APPWRITE_DISABLED_DATES_COLLECTION_ID;
const disabledTimesCollectionId =
    process.env.APPWRITE_BLOCKED_SLOTS_COLLECTION_ID;
const blacklistCollectionId = process.env.APPWRITE_BLACKLIST_COLLECTION_ID;

const client = new sdk.Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

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

const userState = {};

const getDisabledDates = async () => {
    try {
        const response = await databases.listDocuments(
            databaseId,
            disabledDatesCollectionId
        );
        return response.documents;
    } catch (error) {
        console.error('Error fetching appointments:', error);
        throw error;
    }
};

bot.setMyCommands([
    { command: '/main_menu', description: 'Головне меню' },
    { command: '/services', description: 'Послуги' },
    { command: '/booking', description: 'Перейти до запису' },
    { command: '/my_appointments', description: 'Мої записи' },
    { command: '/cancel', description: 'Скасувати запис' },
    { command: '/info', description: 'Контакти та адреса' },
]);

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

let selectedServices = {};

const getBlockedTimes = async (data, collectionId) => {
    try {
        const response = await databases.listDocuments(
            databaseId,
            collectionId,
            [sdk.Query.equal('date', data)]
        );
        return response.documents.map((time) => time.time);
    } catch (error) {
        console.error('Помилка при отриманні заблокованих слотів:', error);
    }
};

const createServiceKeyboard = (chatId, includeSubmit = false) => {
    const keyboard = services.map((service) => {
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
                text: 'Записатися',
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
    tomorrowDay.setHours(tomorrowDay.getHours() + 3);
    return tomorrowDay.toISOString().split('T')[0];
};

const getStopDay = () => {
    let stopDay = new Date();
    stopDay.setMonth(stopDay.getMonth() + 2);
    return stopDay.toISOString().split('T')[0];
};

const Calendar = require('telegram-inline-calendar');
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

    if (text === '/start') {
        userState[chatId] = {
            selectedServices: [],
            selectedDate: null,
            selectedTime: null,
        };
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
        sendOptions(chatId, 'Оберіть команду з меню, щоб продовжити.', [
            ['Послуги', 'Запис', 'Мої записи'],
            ['Скасувати запис', 'Контакти та адреса'],
        ]);
    } else if (text === '/services' || text === 'Послуги') {
        sendOptions(chatId, `Послуги:\n\n${getServicesList()}`, [
            ['Головне меню', 'Запис'],
        ]);
    } else if (text === '/booking' || text === 'Запис') {
        bot.sendMessage(chatId, 'Оберіть послугу (або декілька):', {
            reply_markup: createServiceKeyboard(chatId, true),
        });
    } else if (text === 'Обрати дату') {
        calendar.startNavCalendar(msg);
    } else if (text === 'Обрати час') {
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
            appointmentsCollectionId
        );
        const blockedTimes = await getBlockedTimes(
            userState[chatId].selectedDate,
            disabledTimesCollectionId
        );
        const availableTimes = hours.filter(
            (time) =>
                !bookedTimes.includes(time) && !blockedTimes.includes(time)
        );

        if (availableTimes.length > 0) {
            bot.sendMessage(chatId, 'Оберіть час:', {
                reply_markup: {
                    inline_keyboard: availableTimes.map((time) => [
                        {
                            text: time,
                            callback_data: `time_${time}`,
                        },
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
        sendOptions(
            chatId,
            `Переконайтесь, що все віроно і натисніть "Записатись" для підтвердження запису.

Послуги: ${userState[chatId].selectedServices.join(', ')}
Дата: ${userState[chatId].selectedDate}
Час: ${userState[chatId].selectedTime}`,
            [['Записатись'], ['Головне меню']]
        );
    } else if (text === 'Записатись') {
        userState[chatId] = {
            ...userState[chatId],
            name: msg.from.first_name,
            phone: `@${msg.from.username}`,
        };
        try {
            const response = await databases.listDocuments(
                databaseId,
                blacklistCollectionId,
                [sdk.Query.equal('userName', `@${msg.from.username}`)]
            );
            if (response.documents.length > 0) {
                sendOptions(
                    chatId,
                    'Ви в чорному списку і не можете записатись на послуги. Зверніться до @hele_nails для вирішення питання.',
                    [['Головне меню']]
                );
            } else {
                if (
                    userState[chatId].selectedServices &&
                    userState[chatId].selectedDate &&
                    userState[chatId].selectedTime
                ) {
                    try {
                        await databases
                            .createDocument(
                                databaseId,
                                appointmentsCollectionId,
                                'unique()',
                                {
                                    name: userState[chatId].name,
                                    phone: userState[chatId].phone,
                                    date: userState[chatId].selectedDate,
                                    time: userState[chatId].selectedTime,
                                    selectedServices:
                                        userState[chatId].selectedServices,
                                    chatId: chatId,
                                }
                            )
                            .then(() => {
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
                                userState[chatId] = {
                                    selectedServices: [],
                                    selectedDate: null,
                                    selectedTime: null,
                                };
                            });
                    } catch (error) {
                        console.error('Помилка при записі:', error);
                        sendOptions(
                            chatId,
                            'Помилка при записі. Спробуйте ще раз.',
                            [['Запис'], ['Головне меню']]
                        );
                    }
                } else {
                    sendOptions(
                        chatId,
                        'Ви не обрали жодної послуги, дати або часу. Будь ласка, спробуйте ще раз.',
                        [['Запис'], ['Головне меню']]
                    );
                }
            }
        } catch (error) {
            console.error('Помилка при отриманні імені користувача:', error);
            sendOptions(
                chatId,
                `Не вдалось отримати ваше ім'я. Будь ласка, спробуйте ще раз.`,
                [['Запис'], ['Головне меню']]
            );
        }
    } else if (text === '/my_appointments' || text === 'Мої записи') {
        try {
            const response = await databases.listDocuments(
                databaseId,
                appointmentsCollectionId,
                [sdk.Query.equal('phone', `@${msg.from.username}`)]
            );
            if (response.documents.length > 0) {
                response.documents.map((document) => {
                    if (new Date(document.date) > new Date()) {
                        bot.sendMessage(
                            chatId,
                            `Ваш запис:

Послуги: ${document.selectedServices.join(', ')}
Дата: ${document.date},
Час: ${document.time}`
                        );
                    } else {
                        sendOptions(
                            chatId,
                            'У вас немає записів. Хочете записатись на послугу?',
                            [['Запис'], ['Головне меню']]
                        );
                    }
                });
                setTimeout(() => {
                    sendOptions(
                        chatId,
                        'Якщо ви хочете скасувати запис, натисніть кнопку нижче.',
                        [['Скасувати запис'], ['Головне меню']]
                    );
                }, 1500);
            } else {
                sendOptions(
                    chatId,
                    'У вас немає записів. Хочете записатись на послугу?',
                    [['Запис'], ['Головне меню']]
                );
            }
        } catch (error) {
            console.error('Помилка при отриманні записів:', error);
            sendOptions(
                chatId,
                'Помилка при отриманні записів. Спробуйте ще раз',
                [['Мої записи'], ['Головне меню']]
            );
        }
    } else if (text === '/cancel' || text === 'Скасувати запис') {
        try {
            const response = await databases.listDocuments(
                databaseId,
                appointmentsCollectionId,
                [sdk.Query.equal('phone', `@${msg.from.username}`)]
            );
            if (response.documents.length > 0) {
                response.documents.map((document) => {
                    if (new Date(document.date) > new Date()) {
                        bot.sendMessage(
                            chatId,
                            `Ваш запис:
Послуги: ${document.selectedServices.join(', ')}
Дата: ${document.date}, Час: ${document.time}.`,
                            {
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            {
                                                text: 'Скасувати запис',
                                                callback_data: `cancel_${document.$id}`,
                                            },
                                        ],
                                    ],
                                },
                            }
                        );
                    } else {
                        sendOptions(
                            chatId,
                            'У вас немає записів. Хочете записатись на послугу?',
                            [['Запис'], ['Головне меню']]
                        );
                    }
                });
            } else {
                sendOptions(
                    chatId,
                    'У вас немає записів. Хочете записатись на послугу?',
                    [['Запис'], ['Головне меню']]
                );
            }
        } catch (error) {
            console.error('Помилка при скасуванні запису:', error);
            sendOptions(
                chatId,
                'Помилка при скасуванні запису. Спробуйтк ще раз',
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

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (data.startsWith('toggle_')) {
        const serviceId = data.split('_')[1];
        if (!selectedServices[chatId]) {
            selectedServices[chatId] = {};
        }
        selectedServices[chatId][serviceId] =
            !selectedServices[chatId][serviceId];

        const updatedKeyboard = createServiceKeyboard(chatId, true);
        bot.editMessageReplyMarkup(updatedKeyboard, {
            chat_id: chatId,
            message_id: messageId,
        });

        bot.answerCallbackQuery(query.id);
    } else if (data === 'services_confirm') {
        const chosenServicesIds = selectedServices[chatId]
            ? Object.keys(selectedServices[chatId]).filter(
                  (key) => selectedServices[chatId][key]
              )
            : [];
        const chosenServicesNames =
            chosenServicesIds
                .map((id) => services.find((s) => s.id === id)?.name)
                .filter((name) => name)
                .join(', ') || false;
        if (chosenServicesNames) {
            sendOptions(
                chatId,
                `Ви обрали наступні послуги: ${chosenServicesNames}. Тепер оберіть дату.`,
                [['Обрати дату']]
            );
        } else if (!chosenServicesNames) {
            bot.sendMessage(
                chatId,
                'Ви не обрали жодної послуги. Будь ласка, спробуйте ще раз.',
                {
                    reply_markup: createServiceKeyboard(chatId, true),
                }
            );
        }

        bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
                chat_id: chatId,
                message_id: query.message.message_id,
            }
        );
        bot.answerCallbackQuery(query.id);
        userState[chatId] = {
            ...userState[chatId],
            selectedServices: chosenServicesNames.split(', '),
        };
        delete selectedServices[chatId];
    } else if (data.startsWith('n_20')) {
        getDisabledDates().then((documents) => {
            const disabledDates = documents.map((date) => date.date);
            const selectedDate = calendar.clickButtonCalendar(query);
            if (disabledDates.includes(selectedDate)) {
                bot.answerCallbackQuery(query.id, {
                    text: 'Ця дата недоступна, оберіть іншу.',
                    show_alert: true,
                });
                calendar.startNavCalendar(query.message);
            } else if (!disabledDates.includes(selectedDate)) {
                if (!data.includes('_+') && !data.includes('_-')) {
                    sendOptions(
                        chatId,
                        `Ви обрали дату: ${selectedDate}. Тепер оберіть час`,
                        [['Обрати час'], ['Головне меню']]
                    );
                    bot.answerCallbackQuery(query.id);
                }
                userState[chatId] = {
                    ...userState[chatId],
                    selectedDate: selectedDate,
                };
            }
        });
    } else if (data.startsWith('time_')) {
        const selectedTime = data.split('_')[1];
        userState[chatId] = {
            ...userState[chatId],
            selectedTime: selectedTime,
        };
        sendOptions(
            chatId,
            `Ви обрали: ${userState[chatId].selectedDate}, ${userState[chatId].selectedTime}. Підтвердити цей час, або обрати інший час?`,
            [['Підтвердити час'], ['Обрати час']]
        );
        bot.answerCallbackQuery(query.id);
        bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
                chat_id: chatId,
                message_id: query.message.message_id,
            }
        );
    } else if (data.startsWith('cancel_')) {
        const appointmentId = data.split('_')[1];
        try {
            databases
                .deleteDocument(
                    databaseId,
                    appointmentsCollectionId,
                    appointmentId
                )
                .then(() => {
                    bot.editMessageReplyMarkup(
                        { inline_keyboard: [] },
                        {
                            chat_id: chatId,
                            message_id: query.message.message_id,
                        }
                    );
                    sendOptions(
                        chatId,
                        'Ваш запис скасовано. Якщо ви хочете записатись знову, натисніть кнопку нижче.',
                        [['Запис'], ['Головне меню']]
                    );
                });
        } catch (error) {
            console.error('Помилка при скасуванні запису:', error);
            sendOptions(
                chatId,
                'Помилка при скасуванні запису. Спробуйте ще раз.',
                [['Скасувати запис'], ['Головне меню']]
            );
        }
        bot.answerCallbackQuery(query.id);
    }
});

const sendReminder = async () => {
    const nowServerTime = new Date();
    const targetInstant = new Date(
        nowServerTime.getTime() + 24 * 60 * 60 * 1000
    );
    const targetKyivDateString = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Kyiv',
    }).format(targetInstant);
    const targetKyivHour = parseInt(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Kyiv',
            hour: 'numeric',
            hourCycle: 'h23',
        }).format(targetInstant)
    );
    const hourToFormat = `${targetKyivHour}:00`;

    try {
        const response = await databases.listDocuments(
            databaseId,
            appointmentsCollectionId,
            [
                sdk.Query.equal('date', targetKyivDateString),
                sdk.Query.equal('time', hourToFormat),
            ]
        );
        if (response.documents.length > 0) {
            if (response.documents[0].chatId) {
                const chatId = response.documents[0].chatId;
                sendOptions(
                    chatId,
                    `<b>Вітаю!</b>

Нагадую, що у вас запланований запис завтра на ${response.documents[0].time}.
Послуги: ${response.documents[0].selectedServices.join(', ')}.
Чекаю вас за адресою: вулиця Георгія Тарасенка, 57А.`,
                    [['Головне меню']]
                );
            }
        }
    } catch (error) {
        console.error('Помилка при отриманні записів:', error);
    }
};

setInterval(() => {
    sendReminder();
}, 60 * 60 * 1000);
