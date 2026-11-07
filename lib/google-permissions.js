'use strict';
const scopes=Object.freeze({identity:'openid',email:'email',storage:'https://www.googleapis.com/auth/drive.appdata',calendar:'https://www.googleapis.com/auth/calendar.app.created',list:'https://www.googleapis.com/auth/calendar.calendarlist.readonly'});
function intent(url){return {storage:url.searchParams.get('storage')==='1',calendar:url.searchParams.get('calendar')==='1'};}
function requested(flow){const result=[scopes.identity,scopes.email];if(flow.storage)result.push(scopes.storage);if(flow.calendar)result.push(scopes.calendar,scopes.list);return [...new Set(result)];}
// Legacy sessions required the app-created calendar permission at login.
function calendarConnected(session){return !!session&&session.calendar!==false;}
function refreshFor(session,feature){
 if(!session)return null;
 // Old sessions did not record Drive authorization separately. Keep their
 // token for scope inspection during deletion without enabling Drive backup.
 if(feature==='drive')return session.driveRefresh||((session.drive||session.driveAuthorized||session.driveAuthorized===undefined)?session.refresh:null);
 if(feature==='calendar')return session.calendarRefresh||(calendarConnected(session)?session.refresh:null);
 return session.refresh||null;
}
function credentials(names,flow,previous,sameUser,newRefresh){
 // OAuth requests are isolated. A narrow new grant cannot replace another
 // feature's refresh token, and an account switch must inherit no credentials.
 const old=sameUser?previous:null,refresh=newRefresh||old?.refresh;
 if(!refresh)return null;
 const driveScope=names.has(scopes.storage),calendarScope=names.has(scopes.calendar)&&names.has(scopes.list);
 // A legacy token retained only for deletion is not proof of Drive access.
 if(driveScope&&!newRefresh&&!(old?.drive||old?.driveAuthorized))return null;
 const driveRefresh=(newRefresh&&driveScope?newRefresh:refreshFor(old,'drive'))||null;
 const calendarRefresh=(newRefresh&&calendarScope?newRefresh:refreshFor(old,'calendar'))||null;
 if((flow.storage&&!driveRefresh)||(flow.calendar!==false&&!calendarRefresh)||(driveScope&&!driveRefresh))return null;
 const drive=!!((flow.storage&&driveScope)||(old?.drive&&driveRefresh));
 const calendar=!!((flow.calendar!==false&&calendarScope)||(calendarConnected(old)&&calendarRefresh));
 const driveAuthorized=!!(driveScope||old?.driveAuthorized||old?.drive);
 // Avoid storing duplicate long tokens in the encrypted browser cookie.
 return {refresh,drive,calendar,driveAuthorized,
  ...(driveRefresh&&(driveRefresh!==refresh||!driveAuthorized)?{driveRefresh}:{}),
  ...(calendarRefresh&&(calendarRefresh!==refresh||!calendar)?{calendarRefresh}:{})};
}
module.exports={scopes,intent,requested,calendarConnected,refreshFor,credentials};
