use super::{idea::Idea, prompt::Prompt, skill::Skill, tip::Tip, todo::Todo};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Dashboard {
    pub today: String,
    pub todos: Vec<Todo>,
    pub ideas: Vec<Idea>,
    pub recent_tips: Vec<Tip>,
    pub recent_skills: Vec<Skill>,
    pub recent_prompts: Vec<Prompt>,
}
