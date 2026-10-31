## Synopsis

A HTML5 version of Jeopardy using Javascript, JQuery, JSON, and Bootstrap, adapted for running Table Topics during Toastmasters Club meetings.

## Code Example

<!--![alt tag](https://pbs.twimg.com/media/CMypgi4WcAA1U7_.png)-->
![preview](./images/screenshot.png)

Use board.json for sample input. Use that format when importing a board file.

## Motivation

Members of my Toastmasters club have always brought a lot of creativity to Table Topics, with photos, grab bags, and even tiny trophies for participants. Inspired by that, I thought a Jeopardy board would be a fun way to run it. I started from the original Jeopardy project and forked it into this version.

## Installation

Host the repository on any static webserver, such as GitHub Pages, and open `index.html`. To try it locally, run `python3 -m http.server` in the repository and go to `http://localhost:8000`.

Saved question sets may not work when `index.html` is opened directly from disk, because some browsers keep each file's storage separate.

## Question Sets

Choose **Manage question sets** on the game's load screen to create and edit named sets. Edits save automatically, and finished sets appear on the load screen ready to play. Set names can be up to 40 characters, and longer names are shortened when saved.

Sets are stored only in the browser you created them in, on that site. Clearing your browser data deletes them, so use **Export all** to keep a backup.

- **Export** saves one set as a board file. You can share it, or import it on another browser.
- **Export all** saves every set in one backup file.
- **Import** accepts board files and backups. A backup lets you choose which of its sets to import. Imports never overwrite existing sets, and a set with a name already in use is saved as a copy, like "Cars (2)".

## Tips

- You can have 4 categories with 4-5 questions each. This should be enough to cover the Table Topics duration
- Daily Doubles are optional. Use them if you'd like the game master to award a special prize for landing on certain topics.
- The second round can be skipped entirely (leave `"double-jeopardy": []` in your board file). One round is usually plenty for a typical Toastmasters meeting.

## TODO

- Whatever Sam wants at this point.

## Contributors

- Original contributions from the [original repository](https://github.com/mvbattista/jeopardy) by [Michael V. Battista](https://github.com/mvbattista).
  - Special thanks to Dan Amrich for giving the blessing to work on this project to Michael Battista
  - Thanks to Ryan McDevitt for posting a general framework to base improvements on.

## License

This software is GNU GPL v3. Feel free to modify it to your needs.
