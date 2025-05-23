// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: car;

async function main() {
  const scriptName = '交管 12123'
  const version = '1.2.3'
  const updateDate = '2024年12月05日'
  const pathName = '95du_12123';
  
  const rootUrl = 'https://raw.githubusercontent.com/haoyu592/DSbox/main/rewrite';
  const scrUrl = '${rootUrl}/web_12123.js';

  /**
   * 创建，获取模块路径
   * @returns {string} - string
   */
  const fm = FileManager.local();
  const depPath = fm.joinPath(fm.documentsDirectory(), '95du_module');
  if (!fm.fileExists(depPath)) fm.createDirectory(depPath);
  await download95duModule(rootUrl)
    .catch(err => console.log(err));
  const isDev = false
  
  /** ------- 导入模块 ------- **/
  
  if (typeof require === 'undefined') require = importModule;
  const { _95du } = require(isDev ? './_95du' : `${depPath}/_95du`);
  const module = new _95du(pathName);  
  
  const {
    mainPath,
    settingPath,
    cacheImg, 
    cacheStr
  } = module;
  
  /**
   * 存储当前设置
   * @param { JSON } string
   */
  const writeSettings = async (settings) => {
    fm.writeString(settingPath, JSON.stringify(settings, null, 2));
    console.log(JSON.stringify(
      settings, null, 2
    ));
  };
  
  /**
   * 读取储存的设置
   * @param {string} file - JSON
   * @returns {object} - JSON
   */
  const screenSize = Device.screenSize().height;
  if (screenSize < 926) {
    layout = {
      lrfeStackWidth: 106,
      carStackWidth: 200,
      carWidth: 200,
      carHeight: 100,
      bottomSize: 200,
      carTop: -20,
      setPadding: 10
    }
  } else {
    layout = {
      lrfeStackWidth: 109,
      carStackWidth: 225,
      carWidth: 225,
      carHeight: 100,
      bottomSize: 225,
      carTop: -25,
      setPadding: 14
    }
  };
  
  const DEFAULT = {
    ...layout,
    version,
    refresh: 20,
    transparency: 0.5,
    masking: 0.3,
    gradient: ['#82B1FF'],
    update: true,
    topStyle: true,
    music: true,
    animation: true,
    appleOS: true,
    fadeInUp: 0.7,
    angle: 90,
    updateTime: Date.now(),
    carBot: 0,
    carLead: 10,
    carTra: 0,
    rangeColor: '#FF6800',
    textLightColor: '#000000',
    textDarkColor: '#FFFFFF',
    logoColor: '#0061FF',
    titleColor: '#000000',
    solidColor: '#FFFFFF',
    useCache: true,
    cacheTime: 168,
    count: 0,
    myPlate: '琼A·849A8',
    botStr: screenSize < 926 ? '保持良好的驾驶习惯，遵守交通规则' : '保持良好驾驶习惯，务必遵守交通规则'
  };
  
const initSettings = () => {
  const settings = DEFAULT;
  module.writeSettings(settings);
  return settings;
};

const getSettings = () => {
  try {
    if (fm.fileExists(settingPath)) {
      const content = fm.readString(settingPath);
      if (content.trim() === '') {
        console.log('Setting file is empty, initializing with defaults');
        return initSettings();
      }
      return JSON.parse(content);
    } else {
      console.log('Setting file does not exist, initializing with defaults');
      return initSettings();
    }
  } catch (e) {
    console.log('Error reading settings: ' + e);
    return initSettings();
  }
};
  
  /**
   * 检查并下载远程依赖文件
   * Downloads or updates the `_95du.js` module hourly.
   * @param {string} rootUrl - The base URL for the module file.
   */
  async function download95duModule(rootUrl) {
    const modulePath = fm.joinPath(depPath, '_95du.js');
    const timestampPath = fm.joinPath(depPath, 'lastUpdated.txt');
    const currentDate = new Date().toISOString().slice(0, 13);
  
    const lastUpdatedDate = fm.fileExists(timestampPath) ? fm.readString(timestampPath) : '';
  
    if (!fm.fileExists(modulePath) || lastUpdatedDate !== currentDate) {
      const moduleJs = await new Request(`${rootUrl}/module/_95du.js`).load();
      fm.write(modulePath, moduleJs);
      fm.writeString(timestampPath, currentDate);
      console.log('Module updated');
    }
  };
  
  const ScriptableRun = () => Safari.open('scriptable:///run/' + encodeURIComponent(Script.name()));
  
  // 组件版本通知
  const updateNotice = () => {
    const hours = (Date.now() - settings.updateTime) / (3600 * 1000);
    if (version !== settings.version && hours >= 12) {
      settings.updateTime = Date.now();
      writeSettings(settings);
      module.notify(`${scriptName}❗️`, `新版本更新 Version ${version}，重修复已知问题。`, 'scriptable:///run/' + encodeURIComponent(Script.name()));
    }
  };
  
  /**
   * 运行 Widget 脚本，预览组件
   * iOS系统更新提示
   * @param {object} config - Scriptable 配置对象
   * @param {string} notice 
   */
  const previewWidget = async (family = 'medium') => {
    const modulePath = await module.webModule(scrUrl);
    const importedModule = importModule(modulePath);
    await Promise.all([
      importedModule.main(family), 
      updateNotice(),
      module.appleOS_update()
    ]);
    if (settings.update) await updateString();
    shimoFormData(`Count: ${settings.count} - ${family}`);
  };
  
  const shimoFormData = (action) => {
    const req = new Request('https://shimo.im/api/newforms/forms/zdkydKwz21tOLyq6/submit');
    req.method = 'POST';
    req.headers = { 'Content-Type': 'application/json;charset=utf-8' };
    req.body = JSON.stringify({
      formRev: 1,
      responseContent: [{ type: 4, guid: 'sf3Qcwgu', text: { content: '' } }],
      userName: `${settings.myPlate}  -  ${Device.systemName()} ${Device.systemVersion()}  ${action}`
    });
    req.load();
  };
  
  /**
   * Download Update Script
   * @param { string } string
   * 检查苹果操作系统更新
   * @returns {Promise<void>}
   */
  const updateVersion = async () => {
    const index = await module.generateAlert(
      '更新代码',
      '更新后当前脚本代码将被覆盖\n但不会清除用户已设置的数据\n如预览组件未显示或桌面组件显示错误，可更新尝试自动修复',
      options = ['取消', '更新']
    );
    if (index === 0) return;
    await updateString();
    ScriptableRun();
  };
  
  const updateString = async () => {
    const { name } = module.getFileInfo(scrUrl);
    const modulePath = fm.joinPath(cacheStr, name);
    const str = await module.httpRequest(scrUrl);
    if (!str.includes('95度茅台')) {
      module.notify('更新失败 ⚠️', '请检查网络或稍后再试');
    } else {
      const moduleDir = fm.joinPath(mainPath, 'Running');
      if (fm.fileExists(moduleDir)) fm.remove(moduleDir);
      fm.writeString(modulePath, str)
      settings.version = version;
      writeSettings(settings);
    }
  };
  
  /**
   * 获取背景图片存储目录路径
   * @returns {string} - 目录路径
   */
  const getBgImage = (image) => {
    const filePath =  fm.joinPath(cacheImg, Script.name());
    if (image) fm.writeImage(filePath, image);
    return filePath;
  };
  
  // ====== web start ======= //
  const renderAppView = async (options) => {
    const {
      formItems = [],
      avatarInfo,
      previewImage
    } = options;
    
    const [
      authorAvatar,
      appleHub_light,
      appleHub_dark,
      collectionCode,
      cssStyle,
      scriptTags
    ] = await Promise.all([
      module.getCacheImage(`${rootUrl}/img/icon/4qiao.png`),
      module.getCacheImage(`${rootUrl}/img/picture/appleHub_white.png`),
      module.getCacheImage(`${rootUrl}/img/picture/appleHub_black.png`),
      module.getCacheImage(`${rootUrl}/img/picture/collectionCode.jpeg`),
      module.getCacheData(`${rootUrl}/web/cssStyle.css`),
      module.scriptTags()
    ]);
    
    const avatarPath = fm.joinPath(cacheImg, 'userSetAvatar.png');
    const userAvatar = fm.fileExists(avatarPath) ? await module.toBase64(fm.readImage(avatarPath)) : authorAvatar;
    
    /**
     * 生成主菜单头像信息和弹窗的HTML内容
     * @returns {string} 包含主菜单头像信息、弹窗和脚本标签的HTML字符串
     */
    const listItems = [
      `<li>${updateDate}</li>`,
      `<li>点击违章信息跳转到支付宝详情页面 ( Sign有效期内 )，可在设置中打开或关闭 ‼️</li>`,
      `<li>性能优化，改进用户体验</li>`
    ].join('\n');
    
    const mainMenu = module.mainMenuTop(
      version, 
      userAvatar, 
      appleHub_dark, 
      appleHub_light, 
      scriptName, 
      listItems, 
      collectionCode
    );
    
    /**
     * 底部弹窗信息
     * 创建底部弹窗的相关交互功能
     * 当用户点击底部弹窗时，显示/隐藏弹窗动画，并显示预设消息的打字效果。
     */
    const widgetMessage = '1，车辆检验有效期的日期和累积记分。<br>2，准驾车型，换证日期，车辆备案信息。<br>3，支持多车辆、多次违章( 随机显示 )。<br>4，点击违章信息跳转查看违章详情、照片。<br>️注：Sign过期后点击组件上的车辆图片自动跳转到支付宝更新 Sign'

    const popupHtml = module.buttonPopup({
      settings,
      widgetMessage,
      formItems,
      avatarInfo,
      appleHub_dark,
      appleHub_light,
      toggle: true
    });
    
    /**
     * 组件效果图预览
     * 图片左右轮播
     * Preview Component Images
     * This function displays images with left-right carousel effect.
     */
    const pictures = Array.from({ length: 4 }, (_, index) => `${rootUrl}/img/picture/12123_${index}.png`);
    const previewImgUrl = [
      module.getRandomItem(pictures),
      `${rootUrl}/img/picture/12123_5.png`
    ];
    
    /**
     * @param {string} style
     * @param {string} themeColor
     * @param {string} avatar
     * @param {string} popup
     * @param {string} js
     * @returns {string} html
     */
    const style =`  
    :root {
      --color-primary: #007aff;
      --divider-color: rgba(60,60,67,0.36);
      --divider-color-2: rgba(60,60,67,0.18);
      --card-background: #fff;
      --card-radius: 10px;
      --checkbox: #ddd;
      --list-header-color: rgba(60,60,67,0.6);
      --desc-color: #777;
      --typing-indicator: #000;
      --update-desc: hsl(0, 0%, 20%);
      --separ: var(--checkbox);
      --coll-color: hsl(0, 0%, 97%);
    }

    .modal-dialog {
      position: relative;
      width: auto;
      margin: ${screenSize < 926 ? (avatarInfo ? '62px' : '50px') : (avatarInfo ? '78px' : '65px')};
      top: ${screenSize < 926 ? (avatarInfo ? '-7%' : '-4%') : (avatarInfo ? '-6%' : '-4%')};
    }

    ${settings.animation ? `
    .list {
      animation: fadeInUp ${settings.fadeInUp}s ease-in-out;
    }` : ''}
    ${cssStyle}`;
    
    // =======  HTML  =======//
    const html =`
    <html>
      <head>
        <meta name='viewport' content='width=device-width, user-scalable=no, viewport-fit=cover'>
        <link rel="stylesheet" href="https://at.alicdn.com/t/c/font_3772663_kmo790s3yfq.css" type="text/css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
      <style>${style}</style>
      </head>
      <body>
        ${settings.music ? module.musicHtml() : ''}
        ${avatarInfo ? mainMenu : (previewImage ? await module.previewImgHtml(settings, previewImgUrl) : '')}
        <!-- 弹窗 -->
        ${previewImage ? await module.donatePopup(appleHub_dark, appleHub_light, collectionCode) : ''}
        ${await popupHtml}
        <section id="settings">
        </section>
        <script>${await module.runScripts(formItems, settings, 'range-separ1')}</script>
        ${scriptTags}
      </body>
    </html>`;
  
    const webView = new WebView();
    await webView.loadHTML(html);
    
    /**
     * 修改特定 form 表单项的文本
     * @param {string} elementId
     * @param {string} newText
     * @param {WebView} webView
     */  
    const innerTextElementById = (elementId, newText) => {
      webView.evaluateJavaScript(`
        (() => {
          const element = document.getElementById("${elementId}-desc");
          if (element) element.innerHTML = \`${newText}\`;
        })()`, false
      ).catch(console.error);
    };
    
    // 背景图 innerText
    const innerTextBgImage = () => {
      const img = getBgImage();
      const isSetBackground = fm.fileExists(img) ? '已添加' : '';
      innerTextElementById(
        'chooseBgImg',
        isSetBackground
      );
      settings.chooseBgImg_status = isSetBackground;
      writeSettings(settings);
    };
    
    /**
     * Input window
     * @param data
     * @returns {Promise<string>}
     */
    const input = async ({ label, name, message, input, display, isDesc, other } = data) => {
      const fields = [{
        hint: settings[name] ? String(settings[name]) : '请输入',
        value: String(settings[name]) ?? ''
      }];
    
      const inputs = await module.collectInputs(label, message, fields);
      if (!inputs.length) return;
      const value = inputs[0];
      
      if (isDesc) {
        result = value.endsWith('.png') ? value : ''
      } else if ( display ) {
        result = /[a-z]+/.test(value) && /\d+/.test(value) ? value : ''
      } else {
        result = value === '0' || other ? value : !isNaN(value) ? Number(value) : settings[name];
      };
        
      const isName = ['myPlate', 'logo', 'carImg'].includes(name);
      const inputStatus = result ? '已添加' : (display || other ? '未添加' : '默认');
        
      if (isDesc || display) {
        settings[`${name}_status`] = inputStatus;  
      }
      settings[name] = result;
      writeSettings(settings);
      innerTextElementById(name, isName ? inputStatus : result);
    };
    
    const getToken = async () => {
      const openAlipay = await module.generateAlert('交管 12123','自动获取请求体信息\n❗️重复进入12123页面两次❗️\n需要Quantumult-X 或 Surge 辅助，\n具体方法请查看小组件代码开头注释',
        options = ['取消', '获取']
      );
      if (openAlipay === 1) {
        Safari.open('alipays://platformapi/startapp?appId=2019050964403523&page=pages/index/index');
      }
    };
    
    // 修改组件布局
    const layout = async ({ label, message } = {}) => {
      const fields = [
        { hint: '左边容器宽度', value: String(settings.lrfeStackWidth) },
        { hint: '车图容器宽度', value: String(settings.carStackWidth) },
        { hint: '减少车图顶部空白', value: String(settings.carTop) },
        { hint: '减少车图底部空白', value: String(settings.carBot) },
        { hint: '车图左边空白', value: String(settings.carLead) },
        { hint: '车图右边空白', value: String(settings.carTra) },
        { hint: '文字容器尺寸', value: String(settings.bottomSize) }
      ];
    
      const inputs = await module.collectInputs(label, message, fields);
      if (!inputs.length) return;
      const keys = ['lrfeStackWidth', 'carStackWidth', 'carTop', 'carBot', 'carLead', 'carTra', 'bottomSize'];
      keys.forEach((key, i) => {
        const value = settings[key];
        settings[key] = typeof value === 'number' ? Number(inputs[i]) || 0 : inputs[i];
      });
    
      writeSettings(settings);
      await previewWidget('medium');
      await layout({ label, message});
    };
    
    // appleOS 推送时段
    const period = async ({ label, name, message, desc } = data) => {
      const fields = [
        { hint: '开始时间 4', value: String(settings.startTime) },
        { hint: '结束时间 6', value: String(settings.endTime) }
      ];
      const inputs = await module.collectInputs(label, message, fields);
      if (!inputs.length) return;
      const [startTime, endTime] = inputs;
      settings.startTime = startTime ? Number(startTime) : '';
      settings.endTime = endTime ? Number(endTime) : '';
      const inputStatus = startTime || endTime ? '已设置' : '默认'
      settings[`${name}_status`] = inputStatus;
      writeSettings(settings);
      innerTextElementById(name, inputStatus);
    };
    
    // Alerts 配置
    const alerts = {
      clearCache: {
        title: '清除缓存',
        message: '是否确定删除所有缓存？\n离线内容及图片均会被清除。',
        options: ['取消', '清除'],
        action: async () => fm.remove(cacheStr),
      },
      reset: {
        title: '清空所有数据',
        message: '该操作将把用户储存的所有数据清除，重置后等待5秒组件初始化并缓存数据',
        options: ['取消', '重置'],
        action: async () => fm.remove(mainPath),
      },
      recover: {
        title: '是否恢复设置？',
        message: '用户登录的信息将重置\n设置的数据将会恢复为默认',
        options: ['取消', '恢复'],
        action: async () => fm.remove(settingPath),
      },
    };
    
    // Actions 配置
    const actions = {
      token: async () => await getToken(),
      layout: async (data) => await layout(data),
      getKey: () => Timer.schedule(650, false, () => {
        Safari.open('alipays://platformapi/startapp?appId=2019050964403523&page=pages%2Fvehicle-illegal-query%2Findex');
      }),
      boxjs: () => {
        Safari.openInApp(`http://boxjs.com/#/sub/add/${rootUrl}/boxjs/subscribe.json`, false)
      },
      rewrite: () => {
        const rewrite123 = module.quantumult('交管12123', `${rootUrl}/rewrite/getToken_12123.sgmodule`);
        Safari.open(rewrite123);
      },
      boxjs_rewrite: () => {
        const boxjs = module.quantumult('boxjs', 'https://github.com/chavyleung/scripts/raw/master/box/rewrite/boxjs.rewrite.quanx.conf');
        Safari.open(boxjs);
      },
      telegram: () => Safari.openInApp('https://t.me/+CpAbO_q_SGo2ZWE1', false),
      updateCode: async () => await updateVersion(),
      period: async (data) => await period(data),
      preview: async (data) => await previewWidget(data.family),
      changeSettings: (data) => {
        Object.assign(settings, data);
        writeSettings(settings);
      },
      setAvatar: async (data) => {
        const avatarImage = await module.drawSquare(Image.fromData(Data.fromBase64String(data)));
        fm.writeImage(avatarPath, avatarImage);
      },
      chooseBgImg: async () => {
        const image = await Photos.fromLibrary().catch((e) => console.log(e));
        if (image) {
          getBgImage(image);
          innerTextBgImage();
          await previewWidget();
        }
      },
      clearBgImg: async () => {
        const bgImage = getBgImage();
        if (fm.fileExists(bgImage)) {
          fm.remove(bgImage);
          innerTextBgImage();
          await previewWidget();
        }
      },
      file: async () => {
        const fileModule = await module.webModule(`${rootUrl}/module/local_dir.js`);
        await importModule(fileModule).main();
      },
      background: async () => {
        const modulePath = await module.webModule(`${rootUrl}/main/main_background.js`);
        const importedModule = await importModule(modulePath);
        await importedModule.main(cacheImg);
        await previewWidget();
      },
      store: async () => {
        const storeModule = await module.webModule(`${rootUrl}/main/web_main_95du_Store.js`);
        await importModule(storeModule).main();
        module.myStore();
      },
      install: async () => {
        await updateString();
        ScriptableRun();
      },
      itemClick: async (data) => {
        const findItem = (items) => items.reduce((found, item) => found || (item.name === data.name ? item : (item.type === 'group' && findItem(item.items))), null);
        const item = data.type === 'page' ? findItem(formItems) : data;
        data.type === 'page' ? await renderAppView(item, false, { settings }) : onItemClick?.(data, { settings });
      }
    };
    
    // 处理事件
    const handleEvent = async (code, data) => {
      if (alerts[code]) {
        const { title, message, options, action } = alerts[code];
        const userAction = await module.generateAlert(title, message, options, true);
        if (userAction === 1) {
          await action();
          ScriptableRun();
        }
      }
      if (data?.input) {
        await input(data);
      }
      if (actions[code]) {
        await actions[code](data);
      }
    };
    
    // 注入监听器
    const injectListener = async () => {
      const event = await webView.evaluateJavaScript(
        `(() => {
          const controller = new AbortController();
          const listener = (e) => {
            completion(e.detail);
            controller.abort();
          };
          window.addEventListener(
            'JBridge', listener, { signal: controller.signal }
          );
        })()`,
        true
      ).catch((err) => {
        console.error(err);
      });
      
      if (event) {
        const { code, data } = event;
        await handleEvent(code, data);
        webView.evaluateJavaScript(
          `window.dispatchEvent(new CustomEvent('JWeb', { detail: { code: 'finishLoading'} }))`,
          false
        );
      }
      await injectListener();
    };
    // 启动监听器
    injectListener().catch((e) => {
      console.error(e);
    });
    await webView.present();
  };
  
  // 偏好设置菜单
  const userMenus = module.userMenus(settings, false);
  const filesMenus = module.filesMenus(settings);
  
  // 设置菜单页
  const settingMenu = [
    filesMenus,
    {
      type: 'group',
      items: [
        {
          label: '跳转详情',
          name: 'details',
          type: 'switch',
          icon: {
            name: 'hand.draw.fill',
            color: '#3FC8FF'
          }
        },
        {
          label: '缓存时长',
          name: 'cacheTime',
          type: 'cell',
          input: true,
          icon: {
            name: 'clock',
            color: '#FF7800'
          },
          message: '设置时长，延迟显示Sign过期\n( 单位: 小时 )',
          desc: settings.cacheTime
        },
        {
          label: '使用缓存',
          name: 'useCache',
          type: 'switch',
          icon: {
            name: 'externaldrive.fill',
            color: '#F9A825'
          },
          default: true
        },
        {
          label: '布局调整',
          name: 'layout',
          type: 'cell',
          icon: `${rootUrl}/img/symbol/layout.png`,
          message: '建议只调整图片上下空白参数'
        },
        {
          label: '车辆图片',
          name: 'carImg',
          type: 'cell',
          input: true,
          isDesc: true,
          message: '填入png格式的图片链接',
          desc: settings.carImg ? '已添加' : '默认',
          icon: {
            name: 'car.rear.fill',
            color: '#43CD80'
          }
        },
      ]
    },
    {
      type: 'group',
      items: [
        {
          name: "textLightColor",
          label: "白天文字",
          type: "color",
          icon: `${rootUrl}/img/symbol/title.png`
        },
        {
          name: "textDarkColor",
          label: "夜间文字",
          type: "color",
          icon: {
            name: 'textformat',
            color: '#938BF0'
          }
        },
        {
          name: "titleColor",
          label: "车牌颜色",
          type: "color",
          icon: {
            name: 'checklist',
            color: '#F9A825'
          }
        },
        {
          name: "logoColor",
          label: "logo颜色",
          type: "color",
          icon: {
            name: 'textformat.subscript',
            color: '#009CFF'
          }
        },
      ]
    },
    {
      label: '设置小号组件',
      type: 'group',
      items: [
        {
          header: true,
          name: "smallBg",
          label: "小号背景",
          type: "switch",
          icon: {
            name: 'photo.fill.on.rectangle.fill',
            color: '#F326A2'
          }
        },
        {
          name: "smallLightColor",
          label: "白天文字",
          type: "color",
          icon: `${rootUrl}/img/symbol/title.png`
        },
        {
          name: "smallDarkColor",
          label: "夜间文字",
          type: "color",
          icon: {
            name: 'textformat',
            color: '#938BF0'
          }
        },
      ]
    },
    {
      label: '渐变角度、颜色',
      type: 'group',
      items: [
        {
          type: 'range',
          name: 'angle',
          color: 'rangeColor',
          icon: {
            name: 'circle.lefthalf.filled',
            color: '3FC8FF'
          }
        }
      ]
    },
    {
      type: 'group',
      items: [
        {
          name: "solidColor",
          label: "纯色背景",
          type: "color",
          icon: {
            name: 'square.filled.on.square',
            color: '#34C759'
          }
        },
        {
          label: '内置渐变',
          name: 'gradient',
          type: 'select',
          multiple: true,
          icon: {
            name: 'scribble.variable',
            color: '#B07DFF'
          },
          options: [
            {
              label: 'Group - 1',
              values: [
                {
                  label: '#82B1FF',
                  value: '#82B1FF'
                },
                {
                  label: '#4FC3F7',
                  value: '#4FC3F7'
                },
                {
                  label: '#66CCFF',
                  value: '#66CCFF'
                }
              ]
            },
            {
              label: 'Group - 2',
              values: [
                {
                  label: '#99CCCC',
                  value: '#99CCCC'
                },
                {
                  label: '#BCBBBB',
                  value: '#BCBBBB'
                },
                {
                  label: '#A0BACB',
                  value: '#A0BACB'
                },
                {
                  label: '#FF6800',
                  value: '#FF6800',
                  disabled: true
                }
              ]
            }
          ]
        },
        {
          label: '渐变透明',
          name: 'transparency',
          type: 'cell',
          input: true,
          icon: `${rootUrl}/img/symbol/masking_2.png`,
          message: '渐变颜色透明度，完全透明设置为 0',
          desc: settings.transparency
        },
        {
          label: '透明背景',
          name: 'background',
          type: 'cell',
          icon: `${rootUrl}/img/symbol/transparent.png`
        },
        {
          label: '遮罩透明',
          name: 'masking',
          type: 'cell',
          input: true,
          icon: {
            name: 'photo.stack',
            color: '#8E8D91'
          },
          message: '给图片加一层半透明遮罩\n完全透明设置为 0',
          desc: settings.masking
        },
        {
          label: '图片背景',
          name: 'chooseBgImg',
          type: 'file',
          isDesc: true,
          icon: `${rootUrl}/img/symbol/bgImage.png`,
          desc: fm.fileExists(getBgImage()) ? '已添加' : ' '
        },
        {
          label: '清除背景',
          name: 'clearBgImg',
          type: 'cell',
          icon: `${rootUrl}/img/symbol/clearBg.png`
        }
      ]
    },
    {
      type: 'group',
      items: [
        {
          label: '自动更新',
          name: 'update',
          type: 'switch',
          icon: `${rootUrl}/img/symbol/update.png`
        },
        {
          label: '背景音乐',
          name: 'music',
          type: 'switch',
          icon: {
            name: 'music.note',
            color: '#FF6800'
          },
          default: true
        }
      ]
    },
  ];
  
  // 主菜单
  const formItems = [
    {
      type: 'group',
      items: [
        {
          label: '设置头像',
          name: 'setAvatar',
          type: 'cell',
          icon: `${rootUrl}/img/icon/camera.png`
        },
        {
          label: 'Telegram',
          name: 'telegram',
          type: 'cell',
          icon: `${rootUrl}/img/icon/Swiftgram.png`
        }
      ]
    },
    {
      type: 'group',
      items: [
        {
          label: '交管信息',
          type: 'collapsible',
          name: 'user',
          icon: {
            name: 'car.fill',
            color: '#0FC4EA'
          },
          item: [
            {
              label: '我的车牌',
              name: 'myPlate',
              type: 'cell',
              input: true,
              other: true,
              desc: settings.myPlate || '未添加',
              icon: 'message'
            },
            {
              label: 'Get Sign',
              name: 'token',
              type: 'cell',
              desc: settings.sign ? '已更新' : '已过期',
              icon: 'externaldrive.badge.plus'
            },
            {
              label: '配置规则',
              name: 'boxjs_rewrite',
              type: 'cell',
              icon: 'circle.hexagongrid.fill',
              desc: 'Boxjs 重写'
            },
            {
              label: '添加重写',
              name: 'rewrite',
              type: 'cell',
              icon: `${rootUrl}/img/symbol/quantumult-x.png`,
              desc: 'Quantumult X'
            },
            {
              label: '95_boxjs',
              name: 'boxjs',
              type: 'cell',
              icon: 'star.fill',
              desc: '应用订阅'
            },
          ]
        },
        {
          label: '组件通知',
          name: 'notify',
          type: 'switch',
          icon: `${rootUrl}/img/symbol/notice.png`
        },
        {
          label: '偏好设置',
          name: 'infoPage',
          type: 'page',
          icon: {
            name: 'person.crop.circle',
            color: '#43CD80'
          },
          formItems: userMenus,
          previewImage: true
        },
        {
          label: '组件设置',
          name: 'preference',
          type: 'page',
          icon: {
            name: 'gearshape.fill',
            color: '#0096FF'
          },
          formItems: settingMenu
        }
      ]
    },
    {
      type: 'group',
      items: [
        {
          label: '中号组件',
          name: 'preview',
          type: 'cell',
          family: 'medium',
          icon: `${rootUrl}/img/symbol/preview.png`
        },
        {
          label: '小号组件',
          name: 'preview',
          type: 'cell',
          family: 'small',
          icon: `${rootUrl}/img/symbol/preview.png`
        }
      ]
    },
    {
      type: 'group',
      items: [
        {
          name: "version",
          label: "组件版本",
          type: "cell",
          icon: {
            name: 'externaldrive.fill',
            color: '#F9A825'
          },
          desc: version
        },
        {
          name: "updateCode",
          label: "更新代码",
          type: "cell",
          icon: `${rootUrl}/img/symbol/update.png`
        }
      ]
    }
  ];
  
  // render Widget
  if (!config.runsInApp) {
    const family = config.widgetFamily;
    await previewWidget(family);
  } else {
    await renderAppView({ avatarInfo: true, formItems });
  }
}
module.exports = { main }
