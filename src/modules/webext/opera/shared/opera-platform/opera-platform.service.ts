import { Injectable } from 'angular-ts-decorators';
import { boundMethod } from 'autobind-decorator';
import browser from 'webextension-polyfill';
import { PlatformType } from '../../../../shared/global-shared.enum';
import { WebExtPlatformService } from '../../../shared/webext-platform/webext-platform.service';

@Injectable('PlatformService')
export class OperaPlatformService extends WebExtPlatformService {
  platformName = PlatformType.Opera;

  getNewTabUrl(): string {
    return 'chrome://newtab';
  }

  @boundMethod
  openUrl(url: string): void {
    // If url is native config page, open new tab instead
    if (this.urlIsNativeConfigPage(url)) {
      browser.tabs.create({}).then(window.close);
      return;
    }
    super.openUrl(url);
  }

  urlIsNativeConfigPage(url: string): boolean {
    return /^chrome:\/\/(?:extensions|settings)/i.test(url ?? '');
  }

  urlIsSupported(url: string): boolean {
    return /^(?!chrome|opera|data)[\w-]+:/i.test(url ?? '');
  }
}
