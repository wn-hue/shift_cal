'use strict';
const scopes=Object.freeze({identity:'openid',email:'email',storage:'https://www.googleapis.com/auth/drive.appdata',calendar:'https://www.googleapis.com/auth/calendar.app.created',list:'https://www.googleapis.com/auth/calendar.calendarlist.readonly',external:'https://www.googleapis.com/auth/calendar.events.readonly'});
function intent(url){return {storage:url.searchParams.get('storage')==='1',calendar:url.searchParams.get('calendar')==='1',external:url.searchParams.get('external')==='1'};}
function requested(flow){const result=[scopes.identity,scopes.email];if(flow.storage)result.push(scopes.storage);if(flow.calendar)result.push(scopes.calendar,scopes.list);if(flow.external)result.push(scopes.list,scopes.external);return [...new Set(result)];}
// Sessions issued before separation required both calendar scopes at login.
function calendarConnected(session){return !!session&&session.calendar!==false;}
function granted(names,flow,previous,sameUser){return {drive:names.has(scopes.storage)&&!!(flow.storage||sameUser&&previous?.drive),calendar:names.has(scopes.calendar)&&names.has(scopes.list)&&!!(flow.calendar!==false||sameUser&&calendarConnected(previous)),external:names.has(scopes.external)&&names.has(scopes.list)&&!!(flow.external||sameUser&&previous?.external)};}
module.exports={scopes,intent,requested,calendarConnected,granted};
