# Make your first game

In about 15 minutes you'll write a tiny story with a choice in Himawari Studio, play it as you write, and turn it into a game you can send to a friend. **You don't need to write any code.** Everything here uses buttons and forms.

You'll need Himawari Studio installed on a Windows 10 or 11 PC. You don't need any art or sound: Himawari shows labeled placeholders until you add your own.

## 1. Start a new project
1. Open Studio. On the welcome screen, choose **New Project**.
2. Type a **name for your game**, for example "My First Story".
3. Next to **Create it in**, choose **Choose…** and pick a folder for your game.
4. Under **Template**, choose **Classic ADV (textbox)**. It's a playable scene with a character, a choice, and placeholder art, so you can start by changing things.
5. Under **Languages**, leave **You write in** on your language. (Translation tools stay out of your way until you add a second language.)
6. Choose **Create Project**.

Studio opens your project. You'll see the story in the **Screenplay** view, and the game playing next to it in **Preview**.

> Want a guided tour first? Choose **Open Tutorial Project** on the welcome screen instead.

## 2. Change a line and watch the game
1. In the list of scenes on the left, open the scene that's already there.
2. In the Screenplay, click on any line of dialogue and change the words.
3. Look at the Preview. It updates as you type, and the game picks up where you were.

That's the loop you'll use all the time: **write, glance, keep writing.**

## 3. Add lines
Below the last row of the scene you'll find the buttons for adding things. Try these:
- **Line**: someone speaking. Pick the **Speaker**, then **Type a line…**.
- **Narration**: text with no speaker.
- **Background**: choose a picture to show behind the characters.
- **Show a character**: bring someone on stage. Add an expression with **Add an expression or attribute**.
- **Music** and **Sound effect**: pick a sound. If the file doesn't exist yet, the game stays silent for now, and that's fine.

You can **drag** any row to move it, and use **Duplicate** or **Delete** on a row. If you make a mistake, **History** can bring it back.

## 4. Add a choice
1. Choose **Choice**.
2. Type the question the player sees.
3. Write what each option says. Use **Add an option** for more.
4. Under each option, add the lines that happen next. Use **Go to scene** to send the player to another scene, or **The end** to finish.

Play it in the Preview and click through both options.

## 5. Add a character
1. Open **Characters** and choose **New character**.
2. Give them a name, and fill in whatever else you like. Only the name is needed to start.
3. Back in the scene, they now appear in the **Speaker** list.

## 6. Add your own art (when you're ready)
You can skip this step: placeholders are fine while you write.

When you have pictures or sound, open **Assets**, choose **Add files…**, and pick them. If a scene names a picture that isn't there yet, you can choose **Make a placeholder** to draw a stand-in from its name and a color, then replace it later with a file of the same name.

## 7. Check every path
Open the **Story graph** and choose **Playtest every path**. Studio plays every route in seconds and tells you how many endings it reached, and which parts a player can never see. Fix anything it flags in **Problems**, which lists each issue in plain words with a suggested fix.

## 8. Share your game
1. Open **Build and export**.
2. Under **Windows game (x64)**, choose **Folder** or **Zip file**.
3. Choose **Export the game**, then **Show in Explorer**.
4. Send the zip to a friend. They unzip it and **double-click the game's `.exe`**. Nothing to install.

More detail is in [Export a game](../how-to/export-a-game.md).

## What's next?
- [Add a language](../how-to/add-a-language.md) so more people can read your story.
- Open **UI Designer** to change how the menus and textbox look.
- [Use AI help](../how-to/use-ai-help.md) if you'd like a writing partner. It's entirely optional.
- Open one of the **Samples** on the welcome screen to see a bigger story.

Stuck? Open an issue or start a discussion at [github.com/PastelSalt/himawari-c](https://github.com/PastelSalt/himawari-c). If something confused you, that's a bug in our docs or in Studio, and we'd like to hear about it.
