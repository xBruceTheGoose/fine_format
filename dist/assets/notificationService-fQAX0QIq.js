class a{constructor(){this.hasPermission=!1,this.permissionRequested=!1,this.checkPermission()}checkPermission(){"Notification"in window&&(this.hasPermission=Notification.permission==="granted")}async requestPermission(){if(!("Notification"in window))return console.warn("This browser does not support notifications"),!1;if(this.hasPermission)return!0;if(this.permissionRequested)return this.hasPermission;this.permissionRequested=!0;try{if(!await this.showNotificationPrompt())return!1;const e=await Notification.requestPermission();return this.hasPermission=e==="granted",this.hasPermission&&this.sendTestNotification(),this.hasPermission}catch(t){return console.error("Failed to request notification permission:",t),!1}}showNotificationPrompt(){return new Promise(t=>{const e=document.createElement("div");e.style.cssText=`
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(10, 10, 10, 0.9);
        backdrop-filter: blur(10px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Source Code Pro', monospace;
      `;const n=document.createElement("div");n.style.cssText=`
        background: linear-gradient(135deg, rgba(26, 26, 26, 0.95), rgba(26, 26, 26, 0.9));
        border: 2px solid #00FF41;
        border-radius: 12px;
        padding: 32px;
        max-width: 500px;
        margin: 20px;
        box-shadow:
          0 0 20px rgba(0, 255, 65, 0.3),
          inset 0 0 20px rgba(0, 255, 65, 0.05);
        text-align: center;
      `,n.innerHTML=`
        <div style="color: #00FF41; font-size: 24px; font-weight: bold; margin-bottom: 16px; text-shadow: 0 0 5px #00FF41;">
          🔔 ENABLE NOTIFICATIONS
        </div>
        <div style="color: #00FFFF; font-size: 16px; margin-bottom: 24px; line-height: 1.5;">
          Get notified when your dataset generation is complete!<br>
          <span style="color: #666666; font-size: 14px;">This is a one-time setup for future convenience.</span>
        </div>
        <div style="display: flex; gap: 16px; justify-content: center;">
          <button id="enable-notifications" style="
            background: linear-gradient(45deg, rgba(0, 255, 65, 0.1), rgba(0, 255, 65, 0.15));
            border: 1px solid #00FF41;
            color: #00FF41;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Source Code Pro', monospace;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 0 5px rgba(0, 255, 65, 0.2);
          ">
            ENABLE NOTIFICATIONS
          </button>
          <button id="skip-notifications" style="
            background: rgba(102, 102, 102, 0.1);
            border: 1px solid #666666;
            color: #666666;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Source Code Pro', monospace;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
          ">
            SKIP
          </button>
        </div>
      `,e.appendChild(n),document.body.appendChild(e);const o=n.querySelector("#enable-notifications"),i=n.querySelector("#skip-notifications");o.addEventListener("mouseenter",()=>{o.style.background="linear-gradient(45deg, rgba(0, 255, 65, 0.15), rgba(0, 255, 65, 0.2))",o.style.boxShadow="0 0 10px rgba(0, 255, 65, 0.3)",o.style.transform="translateY(-1px)"}),o.addEventListener("mouseleave",()=>{o.style.background="linear-gradient(45deg, rgba(0, 255, 65, 0.1), rgba(0, 255, 65, 0.15))",o.style.boxShadow="0 0 5px rgba(0, 255, 65, 0.2)",o.style.transform="translateY(0)"}),i.addEventListener("mouseenter",()=>{i.style.background="rgba(102, 102, 102, 0.2)",i.style.borderColor="#999999",i.style.color="#999999"}),i.addEventListener("mouseleave",()=>{i.style.background="rgba(102, 102, 102, 0.1)",i.style.borderColor="#666666",i.style.color="#666666"}),o.addEventListener("click",()=>{document.body.removeChild(e),t(!0)}),i.addEventListener("click",()=>{document.body.removeChild(e),t(!1)});const r=s=>{s.key==="Escape"&&(document.body.removeChild(e),document.removeEventListener("keydown",r),t(!1))};document.addEventListener("keydown",r)})}sendTestNotification(){this.hasPermission&&new Notification("🚀 Fine Format Notifications Enabled!",{body:"You'll be notified when your dataset generation completes.",icon:"/favicon.ico",tag:"fine-format-test",requireInteraction:!1})}async sendCompletionNotification(t,e,n){if(this.hasPermission)try{const o=new Notification("✅ Dataset Generation Complete!",{body:`Successfully generated ${t} Q&A pairs (${e} correct, ${n} incorrect). Ready for download!`,icon:"/favicon.ico",tag:"fine-format-complete",requireInteraction:!0});o.onclick=()=>{window.focus(),o.close()},setTimeout(()=>{o.close()},1e4)}catch(o){console.error("Failed to send completion notification:",o)}}async sendErrorNotification(t){if(this.hasPermission)try{const e=new Notification("❌ Dataset Generation Failed",{body:`Error: ${t.substring(0,100)}${t.length>100?"...":""}`,icon:"/favicon.ico",tag:"fine-format-error",requireInteraction:!0});e.onclick=()=>{window.focus(),e.close()},setTimeout(()=>{e.close()},15e3)}catch(e){console.error("Failed to send error notification:",e)}}isSupported(){return"Notification"in window}hasNotificationPermission(){return this.hasPermission}}const d=new a;export{d as notificationService};
