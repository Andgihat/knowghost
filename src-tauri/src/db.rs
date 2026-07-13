use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Card {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub card_type: String, // "chat" | "summary"
    pub tags: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    #[serde(rename = "cardId")]
    pub card_id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub prompt_type: String, // "llm" | "transcription"
    pub content: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCardRequest {
    pub title: String,
    pub card_type: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCardRequest {
    pub id: String,
    pub title: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub card_id: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePromptRequest {
    pub name: String,
    pub prompt_type: String,
    pub content: String,
}

// ─── Database ─────────────────────────────────────────────────────────

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: &PathBuf) -> SqlResult<Self> {
        fs::create_dir_all(app_dir).ok();
        let db_path = app_dir.join("knowghost.db");
        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;",
        )?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'chat',
                tags TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_messages_card_id ON messages(card_id);
            CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);",
        )?;
        Ok(())
    }

    // ── Cards ────────────────────────────────────────────────────────

    pub fn list_cards(&self) -> SqlResult<Vec<Card>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, type, tags, created_at, updated_at FROM cards ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let tags_json: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            Ok(Card {
                id: row.get(0)?,
                title: row.get(1)?,
                card_type: row.get(2)?,
                tags,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_card(&self, id: &str) -> SqlResult<Option<Card>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, type, tags, created_at, updated_at FROM cards WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            let tags_json: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            Ok(Card {
                id: row.get(0)?,
                title: row.get(1)?,
                card_type: row.get(2)?,
                tags,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.next().transpose()
    }

    pub fn create_card(&self, req: CreateCardRequest) -> SqlResult<Card> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let card_type = req.card_type.unwrap_or_else(|| "chat".to_string());
        let tags = serde_json::to_string(&req.tags.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());

        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO cards (id, title, type, tags, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, req.title, card_type, tags, now, now],
            )?;
        } // conn dropped here, mutex released

        self.get_card(&id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn update_card(&self, req: UpdateCardRequest) -> SqlResult<Card> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();

        if let Some(title) = &req.title {
            conn.execute(
                "UPDATE cards SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, req.id],
            )?;
        }
        if let Some(tags) = &req.tags {
            let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "UPDATE cards SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                params![tags_json, now, req.id],
            )?;
        }

        drop(conn);
        self.get_card(&req.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_card(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM cards WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn search_cards(&self, query: &str) -> SqlResult<Vec<Card>> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, title, type, tags, created_at, updated_at
             FROM cards
             WHERE title LIKE ?1 OR tags LIKE ?1
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![pattern], |row| {
            let tags_json: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            Ok(Card {
                id: row.get(0)?,
                title: row.get(1)?,
                card_type: row.get(2)?,
                tags,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    // ── Messages ─────────────────────────────────────────────────────

    pub fn list_messages(&self, card_id: &str) -> SqlResult<Vec<Message>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, card_id, role, content, created_at FROM messages WHERE card_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![card_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                card_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_message(&self, req: CreateMessageRequest) -> SqlResult<Message> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO messages (id, card_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, req.card_id, req.role, req.content, now],
        )?;

        // Update card's updated_at
        conn.execute(
            "UPDATE cards SET updated_at = ?1 WHERE id = ?2",
            params![now, req.card_id],
        )?;

        Ok(Message {
            id,
            card_id: req.card_id,
            role: req.role,
            content: req.content,
            created_at: now,
        })
    }

    pub fn delete_messages(&self, card_id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages WHERE card_id = ?1", params![card_id])?;
        Ok(())
    }

    // ── Prompts ──────────────────────────────────────────────────────

    pub fn list_prompts(&self, prompt_type: Option<&str>) -> SqlResult<Vec<Prompt>> {
        let conn = self.conn.lock().unwrap();
        let (sql, rows): (String, Box<dyn Fn(&rusqlite::Row) -> rusqlite::Result<Prompt>>) = match prompt_type {
            Some(pt) => (
                "SELECT id, name, type, content, is_active FROM prompts WHERE type = ?1 ORDER BY name".to_string(),
                Box::new(move |row: &rusqlite::Row| {
                    Ok(Prompt {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        prompt_type: row.get(2)?,
                        content: row.get(3)?,
                        is_active: row.get::<_, i32>(4)? != 0,
                    })
                }),
            ),
            None => (
                "SELECT id, name, type, content, is_active FROM prompts ORDER BY type, name".to_string(),
                Box::new(|row: &rusqlite::Row| {
                    Ok(Prompt {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        prompt_type: row.get(2)?,
                        content: row.get(3)?,
                        is_active: row.get::<_, i32>(4)? != 0,
                    })
                }),
            ),
        };

        let mut stmt = conn.prepare(&sql)?;
        let param: Vec<Box<dyn rusqlite::types::ToSql>> = match prompt_type {
            Some(pt) => vec![Box::new(pt.to_string())],
            None => vec![],
        };
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = param.iter().map(|p| p.as_ref()).collect();
        let mapped = stmt.query_map(param_refs.as_slice(), &rows)?;
        mapped.collect()
    }

    pub fn create_prompt(&self, req: CreatePromptRequest) -> SqlResult<Prompt> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO prompts (id, name, type, content, is_active) VALUES (?1, ?2, ?3, ?4, 0)",
            params![id, req.name, req.prompt_type, req.content],
        )?;

        Ok(Prompt {
            id,
            name: req.name,
            prompt_type: req.prompt_type,
            content: req.content,
            is_active: false,
        })
    }

    pub fn update_prompt(&self, id: &str, name: Option<&str>, content: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        if let Some(n) = name {
            conn.execute("UPDATE prompts SET name = ?1 WHERE id = ?2", params![n, id])?;
        }
        if let Some(c) = content {
            conn.execute("UPDATE prompts SET content = ?1 WHERE id = ?2", params![c, id])?;
        }
        Ok(())
    }

    pub fn set_active_prompt(&self, id: &str, prompt_type: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE prompts SET is_active = 0 WHERE type = ?1", params![prompt_type])?;
        conn.execute("UPDATE prompts SET is_active = 1 WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_prompt(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM prompts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_active_prompt(&self, prompt_type: &str) -> SqlResult<Option<Prompt>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, type, content, is_active FROM prompts WHERE type = ?1 AND is_active = 1 LIMIT 1",
        )?;
        let mut rows = stmt.query_map(params![prompt_type], |row| {
            Ok(Prompt {
                id: row.get(0)?,
                name: row.get(1)?,
                prompt_type: row.get(2)?,
                content: row.get(3)?,
                is_active: row.get::<_, i32>(4)? != 0,
            })
        })?;
        rows.next().transpose()
    }
}
