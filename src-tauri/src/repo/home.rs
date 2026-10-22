use crate::{domain::home::*, error::AppResult};
use rusqlite::{Connection, params};

/// Six compact projections; counts are not capped by list pagination.
pub fn overview(conn: &Connection, today: &str, cutoff: i64) -> AppResult<HomeOverview> {
    let mut nodes = Vec::with_capacity(6);
    for id in ["idea", "material", "todo", "tip", "skill", "prompt"] {
        let live = if id == "prompt" {
            "deleted_at IS NULL AND is_system_template=0"
        } else {
            "deleted_at IS NULL"
        };
        let filter = match id {
            "idea" => format!("{live} AND date=?1"),
            "todo" => format!("{live} AND parent_id IS NULL AND status='todo' AND due_date<=?1"),
            _ => format!("{live} AND ?1 IS NOT NULL"),
        };
        let count = conn.query_row(
            &format!("SELECT count(*) FROM {id} WHERE {filter}"),
            [today],
            |r| r.get(0),
        )?;
        let overdue = if id == "todo" {
            conn.query_row("SELECT count(*) FROM todo WHERE deleted_at IS NULL AND parent_id IS NULL AND status='todo' AND due_date<?", [today], |r| r.get(0))?
        } else {
            0
        };
        let recent7 = conn.query_row(
            &format!("SELECT count(*) FROM {id} WHERE {live} AND created_at>=?"),
            [cutoff],
            |r| r.get(0),
        )?;
        let (title, sub, order) = match id {
            "idea" => ("content_md", "NULL", "created_at DESC,id DESC"),
            "material" => ("title", "kind", "updated_at DESC,id DESC"),
            "todo" => (
                "title",
                "CASE WHEN due_date<?1 THEN 'overdue' ELSE due_date END",
                "due_date,priority,sort_order,created_at,id",
            ),
            "skill" => ("name", "NULL", "updated_at DESC,id DESC"),
            _ => ("title", "NULL", "updated_at DESC,id DESC"),
        };
        let latest_filter = if id == "idea" {
            format!("{live} AND ?1 IS NOT NULL")
        } else {
            filter
        };
        let mut stmt = conn.prepare(&format!(
            "SELECT id,{title},{sub} FROM {id} WHERE {latest_filter} ORDER BY {order} LIMIT 3"
        ))?;
        let latest = stmt
            .query_map(params![today], |r| {
                Ok(HomeLatest {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    sub: r.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        nodes.push(HomeNode {
            id: id.into(),
            count,
            overdue,
            recent7,
            latest,
        });
    }
    Ok(HomeOverview {
        today: today.into(),
        nodes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn home_intro_values_and_unknown_settings_are_validated() {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&mut c).unwrap();
        for value in ["daily", "always", "never"] {
            let tx = c.transaction().unwrap();
            let settings =
                crate::repo::settings::set(&tx, "home.intro", &serde_json::json!(value)).unwrap();
            assert_eq!(settings.home_intro, value);
            tx.commit().unwrap();
        }
        for value in [serde_json::json!(true), serde_json::json!("sometimes")] {
            let tx = c.transaction().unwrap();
            assert!(crate::repo::settings::set(&tx, "home.intro", &value).is_err());
        }
    }
    #[test]
    fn counts_rollover_deleted_templates_local_dates_and_latest() {
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&mut c).unwrap();
        c.execute_batch("INSERT INTO idea(id,content_md,date,created_at,updated_at) VALUES ('i','原文','2026-10-21',100,100),('old','昨日','2026-10-20',100,100);
          INSERT INTO todo(id,title,due_date,status,created_at,updated_at) VALUES ('late','逾期','2026-10-20','todo',100,100),('now','今天','2026-10-21','todo',100,100),('future','未来','2026-10-22','todo',100,100),('done','完成','2026-10-21','done',100,100);
          INSERT INTO todo(id,title,parent_id,due_date,created_at,updated_at) VALUES ('child','子任务','now','2026-10-21',100,100);
          INSERT INTO tip(id,title,created_at,updated_at,deleted_at) VALUES ('deleted','删除',100,100,101);
          INSERT INTO prompt(id,title,created_at,updated_at,is_system_template) VALUES ('user','用户',100,100,0),('system','模板',100,100,1);
          INSERT INTO material(id,kind,title,created_at,updated_at) VALUES ('m','component','组件',100,100);").unwrap();
        let h = overview(&c, "2026-10-21", 90).unwrap();
        let n = |id: &str| h.nodes.iter().find(|n| n.id == id).unwrap();
        assert_eq!(n("idea").count, 1);
        assert_eq!(n("idea").recent7, 2);
        assert_eq!(n("idea").latest.len(), 2);
        assert_eq!(n("todo").count, 2);
        assert_eq!(n("todo").overdue, 1);
        assert_eq!(n("todo").latest[0].sub.as_deref(), Some("overdue"));
        assert_eq!(n("tip").count, 0);
        assert_eq!(n("prompt").count, 1);
        assert_eq!(n("prompt").recent7, 1);
        assert_eq!(n("material").latest[0].sub.as_deref(), Some("component"));
        assert!(
            overview(&c, "2026-10-21", 101)
                .unwrap()
                .nodes
                .iter()
                .all(|n| n.recent7 == 0)
        );
    }
}
