import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : path.resolve(process.cwd(), 'data');
fs.mkdirSync(dir,{recursive:true});
export const db = new Database(path.join(dir,'chitraguess.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, is_public INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, room_code TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, joined_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT NOT NULL, round_no INTEGER NOT NULL, category TEXT NOT NULL, answer TEXT NOT NULL, drawer_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS guesses(id INTEGER PRIMARY KEY AUTOINCREMENT, round_id INTEGER NOT NULL, player_id TEXT NOT NULL, guess TEXT NOT NULL, correct INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
export function saveRoom(code:string,isPublic:boolean){db.prepare('INSERT OR REPLACE INTO rooms(code,is_public) VALUES(?,?)').run(code,isPublic?1:0);}
export function savePlayer(id:string,code:string,name:string){db.prepare('INSERT OR REPLACE INTO players(id,room_code,name) VALUES(?,?,?)').run(id,code,name);}
export function saveRound(code:string,n:number,category:string,answer:string,drawer:string){db.prepare('INSERT INTO rounds(room_code,round_no,category,answer,drawer_id) VALUES(?,?,?,?,?)').run(code,n,category,answer,drawer);}
export function updateRoundAnswer(roundId:number,answer:string){db.prepare('UPDATE rounds SET answer=? WHERE id=?').run(answer,roundId);}
export function saveGuess(roundId:number,playerId:string,guess:string,correct:boolean){db.prepare('INSERT INTO guesses(round_id,player_id,guess,correct) VALUES(?,?,?,?)').run(roundId,playerId,guess,correct?1:0);}
export function scorePlayer(id:string,delta:number){db.prepare('UPDATE players SET score=score+? WHERE id=?').run(delta,id);}
export function deletePlayer(id:string){db.prepare('DELETE FROM players WHERE id=?').run(id);}
export function deleteRoom(code:string){db.prepare('DELETE FROM rooms WHERE code=?').run(code);db.prepare('DELETE FROM players WHERE room_code=?').run(code);}
