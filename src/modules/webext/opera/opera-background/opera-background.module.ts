import angular from 'angular';
import { NgModule } from 'angular-ts-decorators';
import browser from 'webextension-polyfill';
import { WebExtBackgroundModule } from '../../webext-background/webext-background.module';
import { OperaBookmarkService } from '../shared/opera-bookmark/opera-bookmark.service';
import { OperaPlatformService } from '../shared/opera-platform/opera-platform.service';

@NgModule({
  id: 'OperaBackgroundModule',
  imports: [WebExtBackgroundModule],
  providers: [
    { provide: 'BookmarkService', useClass: OperaBookmarkService },
    { provide: 'PlatformService', useClass: OperaPlatformService }
  ]
})
class OperaBackgroundModule {}

// Bootstrap the application when document is ready
angular.element(document).ready(() => {
  // Only bootstrap if not already bootstrapped
  if (!angular.element(document).scope()) {
    angular.bootstrap(document, [(OperaBackgroundModule as NgModule).module.name]);
  }

  // Set synchronous event handlers
  browser.runtime.onInstalled.addListener((details) => {
    // Store event details as element data
    const element = document.querySelector('#install');
    if (!element) {
      console.error('Install element not found in background page');
      return;
    }
    angular.element(element).data('details', details);
    (element as HTMLButtonElement).click();
  });
});
