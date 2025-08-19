// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: project-diagram;
// 文件管理器
const fm = FileManager.local();
const settingsFile = fm.joinPath(fm.documentsDirectory(), "shortcut_settings.json");
const backgroundFile = fm.joinPath(fm.documentsDirectory(), "widget_background.jpg");

// 读取配置文件
let actions = [];
if (fm.fileExists(settingsFile)) {
    try {
        actions = JSON.parse(fm.readString(settingsFile));
        actions = actions.filter((item) => item && typeof item.url === "string" && typeof item.iconUrl === "string");
    } catch (e) {
        actions = [];
    }
} else {
    actions = [];
    saveSettings(actions);
}

// 保存配置
function saveSettings(data) {
    fm.writeString(settingsFile, JSON.stringify(data, null, 2));
}

let currentTable = null; // 用于跟踪当前显示的 UITable

// 显示设置界面
async function showSettings() {
    if (currentTable) {
        currentTable.dismiss();
    }
    
    let table = new UITable();
    currentTable = table;
    table.showSeparators = true;

    // 添加背景设置行
    let backgroundRow = new UITableRow();
    backgroundRow.height = 50;
    let backgroundButton = backgroundRow.addButton("设置背景图片");
    backgroundButton.centerAligned();
    backgroundButton.onTap = async () => {
        const img = await Photos.fromLibrary();
        fm.writeImage(backgroundFile, img);
        table.reload(); // 仅刷新表格
    };
    table.addRow(backgroundRow);
    
    // 显示现有链接
    for (let i = 0; i < actions.length; i++) {
        let action = actions[i];
        let row = new UITableRow();
        row.height = 60;

        // 图标和 URL
        let iconCell = row.addImage(await loadImage(action.iconUrl || ""));
        iconCell.widthWeight = 10;
        let urlCell = row.addText(action.name || action.url || "未设置链接"); // 显示名称，如果名称不存在则显示链接
        urlCell.widthWeight = 40;

        const buttonWidthWeight = 10;
        
        // 上移按钮
        let upButton = row.addButton("↑");
        upButton.widthWeight = buttonWidthWeight;
        upButton.onTap = () => {
            if (i > 0) {
                [actions[i - 1], actions[i]] = [actions[i], actions[i - 1]];
                saveSettings(actions);
                table.reload();
            }
        };

        // 下移按钮
        let downButton = row.addButton("↓");
        downButton.widthWeight = buttonWidthWeight;
        downButton.onTap = () => {
            if (i < actions.length - 1) {
                [actions[i], actions[i + 1]] = [actions[i + 1], actions[i]];
                saveSettings(actions);
                table.reload();
            }
        };

        // 编辑按钮
        let editButton = row.addButton("编辑");
        editButton.widthWeight = buttonWidthWeight;
        editButton.onTap = () => {
            editLink(i, table);
        };

        // 删除按钮
        let deleteButton = row.addButton("删除");
        deleteButton.widthWeight = buttonWidthWeight;
        deleteButton.onTap = () => {
            actions.splice(i, 1);
            saveSettings(actions);
            table.reload();
        };

        table.addRow(row);
    }

    // 添加“加号”按钮
    let addRow = new UITableRow();
    addRow.height = 50;
    let addButton = addRow.addButton("添加新链接");
    addButton.centerAligned();
    addButton.onTap = () => {
        actions.push({ name: "新链接", url: "", iconUrl: "" });
        saveSettings(actions);
        editLink(actions.length - 1, table);
    };
    table.addRow(addRow);

    // 添加“预览”按钮
    let previewRow = new UITableRow();
    previewRow.height = 50;
    let previewButton = previewRow.addButton("预览效果");
    previewButton.centerAligned();
    previewButton.onTap = async () => {
        let widget = await generateWidget();
        widget.presentMedium();
    };
    table.addRow(previewRow);

    table.present();
}

// 编辑链接
async function editLink(index, parentTable) {
    let action = actions[index] || { name: "", url: "", iconUrl: "" };

    let alert = new Alert();
    alert.title = `编辑链接 ${index + 1}`;
    alert.addTextField("名称", action.name || ""); // 索引 0
    alert.addTextField("跳转链接 URL/url scheme", action.url || ""); // 索引 1
    alert.addTextField("图标 URL", action.iconUrl || ""); // 索引 2

    alert.addAction("从相册选择图标");
    alert.addAction("保存");
    alert.addCancelAction("取消");

    let response = await alert.present();

    if (response === 0) {
        // 从相册选择图标
        const img = await Photos.fromLibrary();
        const path = fm.joinPath(fm.documentsDirectory(), `icon_${Date.now()}.png`);
        fm.writeImage(path, img);
        action.iconUrl = `file://${path}`;
        saveSettings(actions);
        editLink(index, parentTable);
    } else if (response === 1) {
        // 保存输入的字段
        action.name = alert.textFieldValue(0);
        action.url = alert.textFieldValue(1);
        action.iconUrl = alert.textFieldValue(2);
        saveSettings(actions);
        parentTable.reload();
    } else {
        parentTable.reload();
    }
}

// 生成小组件
async function generateWidget() {
    let widget = new ListWidget();
    if (fm.fileExists(backgroundFile)) {
        widget.backgroundImage = fm.readImage(backgroundFile);
    } else {
        widget.backgroundColor = new Color("#f2f2f7");
    }

    const iconSize = 30;
    const spacing = 5;
    const itemsPerRow = 8;
    const totalRows = Math.ceil(actions.length / itemsPerRow);

    const totalHeight = totalRows * iconSize + (totalRows - 1) * spacing;
    const widgetHeight = 168;
    const extraShift = -3;

    const topPadding = Math.max(0, (widgetHeight - totalHeight) / 2 - extraShift);
    const bottomPadding = Math.max(0, (widgetHeight - totalHeight) / 2 + extraShift);
    widget.setPadding(topPadding, 10, bottomPadding, 10);

    for (let row = 0; row < totalRows; row++) {
        let rowStack = widget.addStack();
        rowStack.spacing = spacing;
        rowStack.centerAlignContent();

        for (let col = 0; col < itemsPerRow; col++) {
            let index = row * itemsPerRow + col;
            if (index >= actions.length) break;

            let action = actions[index];
            let buttonStack = rowStack.addStack();
            buttonStack.layoutVertically();
            buttonStack.setPadding(3, 3, 3, 3);
            buttonStack.url = action.url || "#";

            try {
                let req = new Request(action.iconUrl);
                let iconImage = await req.loadImage();
                let icon = buttonStack.addImage(iconImage);
                icon.imageSize = new Size(iconSize, iconSize);
                icon.cornerRadius = 6;
            } catch (e) {
                let placeholder = buttonStack.addText("🚫");
                placeholder.font = Font.boldSystemFont(14);
                placeholder.textColor = new Color("#ff3333");
                placeholder.centerAlignText();
            }
        }
        widget.addSpacer(spacing);
    }

    return widget;
}

// 加载图标
async function loadImage(url) {
    try {
        if (url.startsWith("file://")) {
            return Image.fromFile(url.replace("file://", ""));
        } else {
            let req = new Request(url);
            return await req.loadImage();
        }
    } catch (e) {
        let placeholderPath = fm.joinPath(fm.documentsDirectory(), "placeholder.png");
        if (!fm.fileExists(placeholderPath)) {
            let ctx = new DrawContext();
            ctx.size = new Size(50, 50);
            ctx.setFillColor(new Color("#cccccc"));
            ctx.fillRect(new Rect(0, 0, 50, 50));
            fm.writeImage(placeholderPath, ctx.getImage());
        }
        return Image.fromFile(placeholderPath);
    }
}

// 判断运行环境
if (config.runsInWidget) {
    let widget = await generateWidget();
    Script.setWidget(widget);
} else {
    await showSettings();
}
Script.complete();