/**
 * Ukrainian UI dictionary for the admin panel (store-admin). Mirrors the
 * store-client dictionary pattern: a single typed `dict` const so every label is
 * defined in one place. Grow this per area as screens are localized.
 */
export const dict = {
  brand: "MobileStore",

  nav: {
    dashboard: "Панель",
    products: "Товари",
    categories: "Категорії",
    orders: "Замовлення",
    users: "Користувачі",
    settings: "Налаштування",
  },

  header: {
    title: "Панель керування",
    searchPlaceholder: "Пошук…",
    adminLabel: "Адміністратор",
  },

  login: {
    metaTitle: "Вхід — Адмін-панель",
    metaDescription: "Увійдіть до адмін-панелі магазину мобільних аксесуарів.",
    heading: "Адмін-панель",
    subtitle: "Увійдіть, щоб керувати магазином",
    email: "Електронна пошта",
    password: "Пароль",
    signIn: "Увійти",
    signingIn: "Вхід…",
    emailInvalid: "Введіть коректну електронну пошту",
    passwordRequired: "Вкажіть пароль",
    errorNotAdmin: "Цей акаунт не має прав адміністратора.",
    errorInvalid: "Невірний email або пароль.",
    errorGeneric: "Щось пішло не так. Спробуйте ще раз.",
  },

  common: {
    save: "Зберегти",
    saving: "Збереження…",
    cancel: "Скасувати",
    create: "Створити",
    edit: "Редагувати",
    delete: "Видалити",
    back: "Назад",
    loading: "Завантаження…",
    actions: "Дії",
    search: "Пошук",
    active: "Активний",
    inactive: "Неактивний",
    activate: "Активувати",
    deactivate: "Деактивувати",
    signOut: "Вийти",
    yes: "Так",
    no: "Ні",
  },
} as const;

export type AdminDictionary = typeof dict;
