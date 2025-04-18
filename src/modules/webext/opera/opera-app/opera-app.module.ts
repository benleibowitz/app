import { NgModule } from 'angular-ts-decorators';
import { WebExtAppModule } from '../../webext-app/webext-app.module';
import { OperaBookmarkService } from '../shared/opera-bookmark/opera-bookmark.service';
import { OperaPlatformService } from '../shared/opera-platform/opera-platform.service';
import { OperaAppHelperService } from './shared/opera-app-helper/opera-app-helper.service';
import angular from 'angular';

@NgModule({
  id: 'OperaAppModule',
  imports: [WebExtAppModule],
  providers: [
    { provide: 'BookmarkService', useClass: OperaBookmarkService },
    { provide: 'PlatformService', useClass: OperaPlatformService },
    { provide: 'AppHelperService', useClass: OperaAppHelperService }
  ]
})
class OperaAppModule {}

// Bootstrap the application when document is ready
angular.element(document).ready(() => {
  angular.bootstrap(document, [(OperaAppModule as NgModule).module.name], { strictDi: true });
});
