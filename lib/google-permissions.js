'use strict';
const scopes=Object.freeze({identity:'openid',email:'email',storage:'https://www.googleapis.com/auth/drive.appdata',calendar:'https://www.googleapis.com/auth/calendar.app.created',list:'https://www.googleapis.com/auth/calendar.calendarlist.readonly'});
function intent(url){return {storage:url.searchParams.get('storage')==='1',calendar:url.searchParams.get('calendar')==='1'};}
function requested(flow){const result=[scopes.identity,scopes.email];if(flow.storage)result.push(scopes.storage);if(flow.calendar)result.push(scopes.calendar,scopes.list);return [...new Set(result)];}
// Legacy sessions required the app-created calendar permission at login.
function calendarConnected(session){return !!session&&session.calendar!==false;}
function granted(names,flow,previous,sameUser){return {drive:names.has(scopes.storage)&&!!(flow.storage||sameUser&&previous?.drive),calendar:names.has(scopes.calendar)&&names.has(scopes.list)&&!!(flow.calendar!==false||sameUser&&calendarConnected(previous))};}
module.exports={scopes,intent,requested,calendarConnected,granted};
