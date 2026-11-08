'use strict';

const {SOURCE_URL} = require('./today-menu.cjs');

const PATH = 'meal-menu/prepared-v1.json';
const PUBLISH_PATH = '/api/today-menu-refresh';
const PUBLISH_URL = 'https://20261104.xyz' + PUBLISH_PATH;
const MAX_BYTES = 180_000;
const MAX_AGE = 2 * 60 * 60 * 1000;

function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value + 'T12:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

const text = (value, max) => typeof value === 'string' && value.length <= max;
const validator = value => value === null || text(value, 300) && !/[\r\n]/.test(value);
const validGroup = group => group && text(group.title, 160) && Array.isArray(group.items) &&
    group.items.length <= 50 && group.items.every(item => text(item, 300));
const validMeal = meal => meal && text(meal.name, 20) && Array.isArray(meal.groups) &&
    meal.groups.length <= 20 && meal.groups.every(validGroup);

function validSnapshot(value) {
    if (!value || value.schema !== 1 || !text(value.checkedAt, 24) ||
        !Number.isFinite(Date.parse(value.checkedAt)) || new Date(value.checkedAt).toISOString() !== value.checkedAt ||
        !validator(value.etag) || !validator(value.lastModified) ||
        !Array.isArray(value.menus) || !value.menus.length || value.menus.length > 31) return false;
    return value.menus.every((menu, index, menus) => menu && isDate(menu.date) &&
        (index === 0 || menus[index - 1].date < menu.date) &&
        menu.status === 'ok' && menu.sourceUrl === SOURCE_URL && menu.message === '' &&
        Array.isArray(menu.meals) && menu.meals.length === 4 && menu.meals.every(validMeal));
}

function mealResponse(snapshot, date) {
    const {checkedAt} = snapshot;
    const menu = snapshot.menus.find(item => item.date === date) || {
        status: 'not_published', date, sourceUrl: SOURCE_URL, meals: [],
        message: '이 날짜의 식단이 아직 등록되지 않았어요.'
    };
    return {...menu, checkedAt, menus: snapshot.menus.map(item => ({...item, checkedAt}))};
}

module.exports = {PATH, PUBLISH_PATH, PUBLISH_URL, MAX_BYTES, MAX_AGE, isDate, validSnapshot, mealResponse};
