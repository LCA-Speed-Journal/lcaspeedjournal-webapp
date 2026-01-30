---
created: <% tp.file.creation_date() %>
tags:
  - dailyNote
---
---
<< [[{{yesterday}}|yesterday]] || [[{{date:YYYY-MM}}|month]] || [[{{tomorrow}}|tomorrow]] >>

# {{date:dddd, MMMM Do, YYYY}}

<% tp.web.daily_quote() %>

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
List FROM "" WHERE file.cday = date("<%tp.date.now("YYYY-MM-DD")%>") SORT file.ctime asc
```

### Notes last touched today
```dataview
List FROM "" WHERE file.mday = date("<%tp.date.now("YYYY-MM-DD")%>") SORT file.mtime asc
```