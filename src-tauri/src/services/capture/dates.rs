use chrono::{Datelike, Duration, Months, NaiveDate, NaiveDateTime, NaiveTime};
use regex::Regex;

#[derive(Debug, PartialEq)]
pub struct Resolved {
    pub date: Option<NaiveDate>,
    pub time: Option<NaiveTime>,
}
/// Resolve supported Chinese date phrases using an injected local clock.
pub fn resolve(phrase: &str, now: NaiveDateTime, prefer_future: bool) -> Option<Resolved> {
    let mut phrase = phrase.trim();
    for suffix in ["之前", "以前", "截止", "为止", "前"] {
        if let Some(rest) = phrase.strip_suffix(suffix) {
            phrase = rest.trim();
            break;
        }
    }
    let expanded = phrase
        .replace("今晚", "今天晚上")
        .replace("明早", "明天早上")
        .replace("明晚", "明天晚上");
    let (date, rest) = date_part(&expanded, now.date(), prefer_future)?;
    let rest = rest.trim();
    if rest.is_empty() {
        return date.map(|date| Resolved {
            date: Some(date),
            time: None,
        });
    }
    if ["上午", "早上", "早", "中午", "下午", "晚上", "晚", "凌晨"].contains(&rest) {
        return Some(Resolved {
            date: date.or(Some(now.date())),
            time: None,
        });
    }
    let time = if let Some(cap) = Regex::new(r"^(\d{1,2}):(\d{2})$").ok()?.captures(rest) {
        NaiveTime::from_hms_opt(number(&cap[1])?, number(&cap[2])?, 0)?
    } else {
        let cap = Regex::new(r"^(上午|早上|早|中午|下午|晚上|晚|凌晨)?([0-9一二两三四五六七八九十零〇]+)(?:点|时)(?:(半)|([0-9一二两三四五六七八九十零〇]+)分)?$").ok()?.captures(rest)?;
        let mut hour = number(&cap[2])?;
        if cap
            .get(1)
            .is_some_and(|p| ["下午", "晚上", "晚"].contains(&p.as_str()))
            && hour < 12
        {
            hour += 12;
        }
        let minute = if cap.get(3).is_some() {
            30
        } else {
            cap.get(4).map(|v| number(v.as_str())).unwrap_or(Some(0))?
        };
        NaiveTime::from_hms_opt(hour, minute, 0)?
    };
    Some(Resolved {
        date,
        time: Some(time),
    })
}

fn number(value: &str) -> Option<u32> {
    if let Ok(n) = value.parse() {
        return Some(n);
    }
    let digit = |s| match s {
        "零" | "〇" => Some(0),
        "一" => Some(1),
        "二" | "两" => Some(2),
        "三" => Some(3),
        "四" => Some(4),
        "五" => Some(5),
        "六" => Some(6),
        "七" => Some(7),
        "八" => Some(8),
        "九" => Some(9),
        _ => None,
    };
    if let Some((tens, units)) = value.split_once('十') {
        Some(
            if tens.is_empty() { 1 } else { digit(tens)? } * 10
                + if units.is_empty() { 0 } else { digit(units)? },
        )
    } else {
        digit(value)
    }
}

fn date_part(s: &str, today: NaiveDate, future: bool) -> Option<(Option<NaiveDate>, &str)> {
    for (word, days) in [
        ("大后天", 3),
        ("今天", 0),
        ("今日", 0),
        ("明天", 1),
        ("明日", 1),
        ("后天", 2),
        ("昨天", -1),
        ("昨日", -1),
        ("前天", -2),
    ] {
        if let Some(rest) = s.strip_prefix(word) {
            return Some((Some(today.checked_add_signed(Duration::days(days))?), rest));
        }
    }
    if let Some(cap) = Regex::new(r"^([0-9一二两三四五六七八九十]+)(?:天以后|天后|日后)")
        .ok()?
        .captures(s)
    {
        let date = today.checked_add_signed(Duration::days(i64::from(number(&cap[1])?)))?;
        return Some((Some(date), &s[cap[0].len()..]));
    }
    if let Some(cap) = Regex::new(r"^(下|本|这)?(?:周|星期|礼拜)([一二三四五六日天])")
        .ok()?
        .captures(s)
    {
        let day = match &cap[2] {
            "一" => 0,
            "二" => 1,
            "三" => 2,
            "四" => 3,
            "五" => 4,
            "六" => 5,
            _ => 6,
        };
        let offset = day - i64::from(today.weekday().num_days_from_monday());
        let shift = match cap.get(1).map(|v| v.as_str()) {
            Some("下") => 7,
            Some(_) => 0,
            None if future && offset < 0 => 7,
            None if !future && offset > 0 => -7,
            _ => 0,
        };
        return Some((
            Some(today.checked_add_signed(Duration::days(offset + shift))?),
            &s[cap[0].len()..],
        ));
    }
    for word in ["本月底", "月底"] {
        if let Some(rest) = s.strip_prefix(word) {
            let first = today.with_day(1)?.checked_add_months(Months::new(1))?;
            return Some((Some(first.pred_opt()?), rest));
        }
    }
    if let Some(cap) = Regex::new(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})")
        .ok()?
        .captures(s)
    {
        return Some((
            Some(NaiveDate::from_ymd_opt(
                cap[1].parse().ok()?,
                number(&cap[2])?,
                number(&cap[3])?,
            )?),
            &s[cap[0].len()..],
        ));
    }
    if let Some(cap) = Regex::new(
        r"^(?:(\d{4})年)?([0-9一二两三四五六七八九十]+)月([0-9一二两三四五六七八九十]+)[日号]",
    )
    .ok()?
    .captures(s)
    {
        let year = cap
            .get(1)
            .map(|v| v.as_str().parse().ok())
            .unwrap_or(Some(today.year()))?;
        let mut date = NaiveDate::from_ymd_opt(year, number(&cap[2])?, number(&cap[3])?)?;
        if cap.get(1).is_none() && ((future && date < today) || (!future && date > today)) {
            date = date.with_year(year + if future { 1 } else { -1 })?;
        }
        return Some((Some(date), &s[cap[0].len()..]));
    }
    if let Some(cap) = Regex::new(r"^(下个月|下月)?([0-9一二两三四五六七八九十]+)[号日]")
        .ok()?
        .captures(s)
    {
        let first = today.with_day(1)?;
        let month = if cap.get(1).is_some() {
            first.checked_add_months(Months::new(1))?
        } else {
            first
        };
        let mut date = month.with_day(number(&cap[2])?)?;
        if cap.get(1).is_none() && ((future && date < today) || (!future && date > today)) {
            let month = if future {
                first.checked_add_months(Months::new(1))?
            } else {
                first.checked_sub_months(Months::new(1))?
            };
            date = month.with_day(number(&cap[2])?)?;
        }
        return Some((Some(date), &s[cap[0].len()..]));
    }
    Some((None, s))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn now(value: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M").unwrap()
    }
    #[test]
    fn date_phrase_table() {
        let clock = now("2026-10-20 14:30");
        for (phrase, future, expected) in [
            ("今天", true, "2026-10-20"),
            ("今日", true, "2026-10-20"),
            ("今晚", true, "2026-10-20"),
            ("下午", true, "2026-10-20"),
            ("明天", true, "2026-10-21"),
            ("明日", true, "2026-10-21"),
            ("明早", true, "2026-10-21"),
            ("明晚", true, "2026-10-21"),
            ("后天", true, "2026-10-22"),
            ("大后天", true, "2026-10-23"),
            ("昨天", false, "2026-10-19"),
            ("昨日", false, "2026-10-19"),
            ("前天", false, "2026-10-18"),
            ("三天后", true, "2026-10-23"),
            ("3天以后", true, "2026-10-23"),
            ("两日后", true, "2026-10-22"),
            ("周三", true, "2026-10-21"),
            ("星期二", true, "2026-10-20"),
            ("礼拜一", true, "2026-10-26"),
            ("周三", false, "2026-10-14"),
            ("本周一", true, "2026-10-19"),
            ("这周一", true, "2026-10-19"),
            ("下周三", true, "2026-10-28"),
            ("下星期三", true, "2026-10-28"),
            ("下礼拜日", true, "2026-11-01"),
            ("周天", true, "2026-10-25"),
            ("月底", true, "2026-10-31"),
            ("本月底", true, "2026-10-31"),
            ("25号", true, "2026-10-25"),
            ("二十五号", true, "2026-10-25"),
            ("15号", true, "2026-11-15"),
            ("15日", false, "2026-10-15"),
            ("25号", false, "2026-09-25"),
            ("下个月5号", true, "2026-11-05"),
            ("下月五日", true, "2026-11-05"),
            ("10月25日", true, "2026-10-25"),
            ("十月二十五日", true, "2026-10-25"),
            ("1月5日", true, "2027-01-05"),
            ("1月5日", false, "2026-01-05"),
            ("12月5日", false, "2025-12-05"),
            ("2026-10-25", true, "2026-10-25"),
            ("2026/10/25", true, "2026-10-25"),
            ("2026年十月二十五日", true, "2026-10-25"),
            ("25号前", true, "2026-10-25"),
            ("25号之前", true, "2026-10-25"),
            ("25号以前", true, "2026-10-25"),
            ("25号截止", true, "2026-10-25"),
            ("25号为止", true, "2026-10-25"),
        ] {
            let result = resolve(phrase, clock, future).unwrap_or_else(|| panic!("{phrase}"));
            assert_eq!(result.date.unwrap().to_string(), expected, "{phrase}");
            assert_eq!(result.time, None, "{phrase}");
        }
        assert_eq!(
            resolve("明天", now("2026-12-31 14:30"), true)
                .unwrap()
                .date
                .unwrap()
                .to_string(),
            "2027-01-01"
        );
        for phrase in [
            "2月30日",
            "下周",
            "过几天",
            "月中",
            "年底前",
            "32号",
            "2026-02-30",
            "25:70",
            "下午25点",
            "完全无日期",
        ] {
            assert_eq!(resolve(phrase, clock, true), None, "{phrase}");
        }
        assert_eq!(resolve("30号", now("2026-02-20 14:30"), true), None);
    }
    #[test]
    fn time_phrase_table() {
        let clock = now("2026-10-20 14:30");
        for (phrase, date, time) in [
            ("下午3点", None, "15:00"),
            ("下午两点", None, "14:00"),
            ("晚上8点半", None, "20:30"),
            ("上午10点20分", None, "10:20"),
            ("中午12点", None, "12:00"),
            ("凌晨1点", None, "01:00"),
            ("9:15", None, "09:15"),
            ("早9时", None, "09:00"),
            ("明天下午3点前", Some("2026-10-21"), "15:00"),
            ("下周三下午3点", Some("2026-10-28"), "15:00"),
            ("今晚8点半", Some("2026-10-20"), "20:30"),
        ] {
            let result = resolve(phrase, clock, true).unwrap_or_else(|| panic!("{phrase}"));
            assert_eq!(
                result.date.map(|d| d.to_string()).as_deref(),
                date,
                "{phrase}"
            );
            assert_eq!(
                result.time.unwrap().format("%H:%M").to_string(),
                time,
                "{phrase}"
            );
        }
    }
}
