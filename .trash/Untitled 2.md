---
created: 2025-08-20 09:02
tags:
  - dailyNote
---
---
<< [[{{yesterday}}|yesterday]] || [[{{date:YYYY-MM}}|month]] || [[{{tomorrow}}|tomorrow]] >>

# {{date:dddd, MMMM Do, YYYY}}

> [!quote] A life spent making mistakes is not only more honourable but more useful than a life spent in doing nothing.
> — Bernard Shaw

## Agenda

> [!todo]+ Today
> ```tasks
> not done
> happens {{date:YYYY-MM-DD}}
> hide recurrence rule
> hide due date
> hide scheduled date
> sort by priority
> ```

> [!danger]+ Overdue 
> ```tasks
> not done
> (due before {{date:YYYY-MM-DD}}) OR ((happens before {{date:YYYY-MM-DD}}) AND (priority is above none))
> hide recurrence rule
> sort by due date
> ```

> [!tip]- Next two weeks
> ```tasks
> not done
> happens after {{date:YYYY-MM-DD}}
> happens before {{date+14d:YYYY-MM-DD}}
> hide recurrence rule
> hide due date
> hide scheduled date
> group by happens
> ```

## Minor Tasking 
## Reading Log 
## Accomplishments 
## Gratitude 
## Health
---
### Notes created today
```dataview
List FROM "" WHERE file.cday = date("2025-08-20") SORT file.ctime asc
```

### Notes last touched today
```dataview
List FROM "" WHERE file.mday = date("2025-08-20") SORT file.mtime asc
```