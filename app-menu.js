function openAppPreferences(){window.SettingsPage.open();}
(() => {
    for (const name of ['adjacent','holidays','memos','shape','theme']) {
        const input = document.getElementById('pref-'+name), key = 'shift_display_'+name;
        if (name === 'theme') input.value = 'current';
        if (name === 'shape') input.value = 'circle';
        try {
            if (name === 'theme') {
                const old = localStorage.getItem('shift_display_mode');
                if (old === 'dark' || old === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches) localStorage.setItem(key,'dark');
                localStorage.removeItem('shift_display_mode');
            }
            const saved = localStorage.getItem(key);
            if (saved !== null) {
                if (name === 'theme') {
                    const theme = ['routine','google'].includes(saved) ? 'test' : saved;
                    input.value = ['current','gpt','toss','dark','test','test1','test3','test4','beige-round'].includes(theme) ? theme : 'current';
                    if (input.value !== saved) localStorage.setItem(key,input.value);
                } else if (name === 'shape') input.value = saved === 'circle' ? 'circle' : 'square';
                else input.checked = saved !== 'false';
            }
        } catch {}
        const apply = () => {
            const value = name === 'shape' || name === 'theme' ? input.value : String(input.checked);
            // Keep the preview on Beige's palette and behavior; its shapes are opt-in.
            document.body.setAttribute('data-pref-'+name,name === 'theme' && value === 'beige-round' ? 'test' : value);
            if (name === 'theme') {
                document.body.toggleAttribute('data-beige-round',value === 'beige-round');
                document.body.removeAttribute('data-pref-mode');
                document.documentElement.style.colorScheme = value === 'dark' ? 'dark' : 'light';
                document.querySelector('meta[name="theme-color"]')?.setAttribute('content',({'beige-round':'#f5f3f2',dark:'#111820',test:'#eeeae4',test1:'#f2f4f6',test3:'#f5f5f7',test4:'#f6f5f1'})[value] || '#ffffff');
            }
            return value;
        };
        apply();
        input.addEventListener('change',() => {
            const value = apply();
            try { localStorage.setItem(key,value); } catch {}
            if (name === 'theme' && typeof renderCalendar === 'function') renderCalendar();
        });
    }
})();
