import angular from 'angular';
import { NgModule } from 'angular-ts-decorators';
import browser from 'webextension-polyfill';
import { ExceptionHandlerService } from '../../shared/errors/exception-handler/exception-handler.service';
import { GlobalSharedModule } from '../../shared/global-shared.module';
import { WebExtSharedModule } from '../shared/webext-shared.module';
import { WebExtBackgroundComponent } from './webext-background.component';
import { WebExtBackgroundService } from './webext-background.service';

@NgModule({
  declarations: [WebExtBackgroundComponent],
  id: 'WebExtBackgroundModule',
  imports: [GlobalSharedModule, WebExtSharedModule],
  providers: [WebExtBackgroundService]
})
export class WebExtBackgroundModule {}

(WebExtBackgroundModule as NgModule).module
  .config([
    '$compileProvider',
    '$httpProvider',
    ($compileProvider: ng.ICompileProvider, $httpProvider: ng.IHttpProvider) => {
      $compileProvider.debugInfoEnabled(false);
      $httpProvider.interceptors.push('ApiRequestInterceptorFactory');
    }
  ])
  .factory('$exceptionHandler', ['$injector', 'AlertService', 'LogService', ExceptionHandlerService.Factory]);

// Set up event handlers after document is ready
angular.element(document).ready(() => {
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

  browser.runtime.onStartup.addListener(() => {
    const element = document.querySelector('#startup');
    if (!element) {
      console.error('Startup element not found in background page');
      return;
    }
    (element as HTMLButtonElement).click();
  });
});
