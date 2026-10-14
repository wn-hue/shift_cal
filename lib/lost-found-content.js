'use strict';
// Local checks only: user text never goes to an external moderation service.
// Normalize separators, digit insertions and invisible Unicode used to evade word checks.
const KO_WORDS=['씨발','씨빨','씨팔','시발','시빨','시팔','씨벌','시벌','씨부랄','씨부럴','쉬발','쉬벌','쌍놈','쌍년','미친놈','미친년','호로새끼','등신','닥쳐','꺼져','씹할','씹새','씹년','씹놈','개새끼','개세끼','개색끼','개색기','개새기','개년','개놈','병신','븅신','빙신','지랄','좆','좃','졷','좇같','보지','자지','섹스','쎅스','섹쓰','쎅쓰','자위','딸딸이','딜도','포르노','야동','음경','음핵','음부','페니스','정액','강간','성폭행','성추행','성희롱','죽여','느금마','니애미','네애미','니애비','네애비','창녀','창년','후장','항문성교','오럴섹','사까시','빠구리','떡치','따먹','따먹히','ㅅㅂ','ㅆㅂ','ㅂㅅ','ㅈㄹ','ㅈ같'];
const EN_WORDS=['fuck','fuckyou','fucking','fucker','motherfucker','shit','bullshit','bitch','asshole','cunt','pussy','dick','cock','porn','porno','pornography','sex','sexy','sexting','blowjob','handjob','hentai'];
const separated=word=>[...word].join('[\\p{P}\\p{S}\\p{Z}\\p{N}\\p{M}]*');
const english=new RegExp('(?:^|[^a-z])(?:'+EN_WORDS.map(separated).join('|')+')(?:$|[^a-z])','iu');
function hasProhibitedContent(value){
  const visible=String(value).normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu,'').normalize('NFC').toLowerCase();
  // "다시 발견" is an ordinary lost-property phrase, not the profanity 시발.
  const words=visible.replace(/다시\s*발견/gu,'다시찾음');
  const compact=words.replace(/[\p{P}\p{S}\p{Z}\p{N}\s]/gu,'').normalize('NFC');
  return KO_WORDS.some(word=>compact.includes(word.normalize('NFKC')))||english.test(visible);
}
module.exports={hasProhibitedContent};
