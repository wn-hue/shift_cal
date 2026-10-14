'use strict';
const assert = require('node:assert/strict');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE);
const url = process.env.CHECK_URL || 'http://127.0.0.1:8769/';
(async () => {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch();
    for (const width of [320, 390, 412]) {
      const page = await browser.newPage({viewport:{width,height:844},isMobile:true,reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.route('**/api/**', route => {
        if (route.request().url().includes('lost-found')) return route.fulfill({json:{connected:true,csrf:'test',blockedCount:0,items:[
          {id:'found',type:'습득',date:'2026-10-15',place:'휴게실',item:'이어폰',storage:'경비실',stage:'경비실 보관 중',history:[]},
          {id:'lost',type:'분실',date:'2026-10-15',place:'현장',item:'지갑',storage:'',stage:'찾는 중',history:[]}
        ]}});
        return route.fulfill({json:{configured:false}});
      });
      await page.goto(url);
      for (const theme of ['current','toss','gpt','dark']) {
        await page.evaluate(t => {
          const input = document.getElementById('pref-theme');
          input.value = t; input.dispatchEvent(new Event('change'));
          setGroup('C'); config.baseHourly=11050; config.ordinaryHourly=14482;
          config.hireDate='2017-01-01'; config.leaveByYear={2026:19};
          saveConfig(); loadConfig(); syncFromCalendar(); switchView('payroll');
        }, theme);
        const toggle = page.getByRole('switch',{name:'예상 실수령액 계산'});
        await toggle.uncheck();
        const bounds = await toggle.boundingBox();
        assert(bounds.width >= 48 && bounds.width > bounds.height && bounds.height >= 28,'switch collapsed to a checkbox');
        await page.locator('.estimate-title').click();
        assert.equal(await toggle.isChecked(),true,'label tap must toggle exactly once');
        assert.equal(await page.locator('#payroll-estimate-panel').isVisible(),true);
        assert.match(await page.locator('#hero-pay-label').textContent(),/세후 추정/);
        const knob = await toggle.evaluate(el => {
          const css=getComputedStyle(el,'::before'),matrix=new DOMMatrix(css.transform);
          return {left:parseFloat(css.left),top:parseFloat(css.top),width:parseFloat(css.width),height:parseFloat(css.height),x:matrix.m41};
        });
        assert(knob.left+knob.x+knob.width<=bounds.width && knob.top+knob.height<=bounds.height,'thumb exceeds track');
        await toggle.click();
        assert.equal(await toggle.isChecked(),false);
        assert.equal(await page.locator('#payroll-estimate-panel').isVisible(),false);
        await toggle.focus(); await page.keyboard.press('Space');
        assert.equal(await toggle.isChecked(),true,'keyboard must toggle exactly once');
        await toggle.uncheck();
        await page.evaluate(() => {switchView('all'); SettingsUI.openLeave();});
        assert.equal(await page.locator('.leave-balance #stat-remain-leave').count(),1);
        const total=parseFloat(await page.locator('#stat-total-leave').textContent());
        const used=parseFloat(await page.locator('#stat-used-leave').textContent());
        const remain=parseFloat(await page.locator('#stat-remain-leave').textContent());
        assert.equal(remain,total-used,'balance must match existing leave calculation');
        assert.equal(await page.locator('#leave-settings-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
        if(width===390&&theme==='current')await page.screenshot({path:'/tmp/shift-refined-leave-'+engine.name()+'.png'});
        await page.evaluate(()=>document.getElementById('leave-settings-dialog').close());
        await page.locator('#lost-found-open').click();
        await page.waitForFunction(()=>document.getElementById('lost-auth').textContent.startsWith('로그인됨'));
        assert.equal(await page.locator('.lost-kind-badge[data-kind=found]').textContent(),'주웠어요 · 습득');
        assert.equal(await page.locator('.lost-kind-badge[data-kind=lost]').textContent(),'찾고 있어요 · 분실');
        await page.getByRole('button',{name:'새 글 등록',exact:true}).click();
        assert.equal(await page.locator('.lost-filters').isVisible(),false);
        const found=page.getByRole('button',{name:'주웠어요 (습득)',exact:true});
        const lost=page.getByRole('button',{name:'찾고 있어요 (분실)',exact:true});
        assert.equal(await found.getAttribute('aria-pressed'),'true');
        const f=await found.boundingBox(),l=await lost.boundingBox();
        assert(l.x-(f.x+f.width)>=8,'post intentions need a visible gap');
        await lost.click();
        assert.equal(await lost.getAttribute('aria-pressed'),'true');
        assert.equal(await found.getAttribute('aria-pressed'),'false');
        assert.equal(await page.locator('#lost-select-type').inputValue(),'분실');
        assert.match(await page.locator('#lost-form-title').textContent(),/잃어버린 물건/);
        assert.equal(await page.locator('#lost-storage-label').isVisible(),false);
        await found.click();
        assert.equal(await page.locator('#lost-select-type').inputValue(),'습득');
        assert.equal(await page.locator('#lost-storage-label').isVisible(),true);
        assert.equal(await page.locator('#lost-found-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
        if(width===390&&theme==='current')await page.screenshot({path:'/tmp/shift-refined-lost-'+engine.name()+'.png'});
        await page.getByRole('button',{name:'작성 취소',exact:true}).click();
        assert.equal(await page.getByLabel('물건·장소 검색',{exact:true}).isVisible(),true);
        await page.getByRole('button',{name:'분실물 닫기',exact:true}).click();
      }
      assert.deepEqual(errors,[]);
      await page.close();
      console.log('PASS UI refinements',engine.name(),width,'switch touch+keyboard+thumb / unchanged leave balance / distinct lost+found / four themes');
    }
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
