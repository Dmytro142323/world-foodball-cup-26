# World Cup 26 Match Centre

Static tournament dashboard with data refreshed from ESPN/FIFA/Sky Sports sources.

## Refresh data locally

```bash
python scripts/update_data.py
```

The scheduled GitHub Actions workflow refreshes `data/worldcup.json` every 15 minutes and deploys the site to GitHub Pages.

The probability panel is an independent form model based on group points, goal difference and knockout wins. It is not betting advice or an official FIFA forecast.
