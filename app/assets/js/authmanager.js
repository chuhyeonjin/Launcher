/**
 * @module authmanager
 */
const ConfigManager = require('./configmanager')
const LoggerUtil    = require('./loggerutil')
const Mojang        = require('./mojang')
const logger        = LoggerUtil('%c[AuthManager]', 'color: #a02d2a; font-weight: bold')
const loggerSuccess = LoggerUtil('%c[AuthManager]', 'color: #209b07; font-weight: bold')
const Microsoft     = require('./microsoft')

async function validateSelectedMojang() {
    const current = ConfigManager.getSelectedAccount()
    const isValid = await Mojang.validate(current.accessToken, ConfigManager.getClientToken())
    if(!isValid){
        try {
            const session = await Mojang.refresh(current.accessToken, ConfigManager.getClientToken())
            ConfigManager.updateAuthAccount(current.uuid, session.accessToken)
            ConfigManager.save()
        } catch(err) {
            logger.debug('Error while validating selected profile:', err)
            if(err && err.error === 'ForbiddenOperationException'){
                // What do we do?
            }
            logger.log('Account access token is invalid.')
            return false
        }
        loggerSuccess.log('Account access token validated.')
        return true
    } else {
        loggerSuccess.log('Account access token validated.')
        return true
    }
}

async function validateSelectedMicrosoft() {
    try {
        const current = ConfigManager.getSelectedAccount()
        const now = new Date().getTime()
        const MCExpiresAt = Date.parse(current.expiresAt)
        const MCExpired = now > MCExpiresAt

        if(MCExpired) {
            const MSExpiresAt = Date.parse(current.microsoft.expires_at)
            const MSExpired = now > MSExpiresAt

            if (MSExpired) {
                const newAccessToken = await Microsoft.refreshAccessToken(current.microsoft.refresh_token)
                const newMCAccessToken = await Microsoft.authMinecraft(newAccessToken.access_token)
                ConfigManager.updateAuthAccount(current.uuid, newMCAccessToken.access_token, newAccessToken.expires_at)
                ConfigManager.save()
                return true
            }
            const newMCAccessToken = await Microsoft.authMinecraft(current.microsoft.access_token)
            ConfigManager.updateAuthAccount(current.uuid, newMCAccessToken.access_token, current.microsoft.access_token, current.microsoft.expires_at, newMCAccessToken.expires_at)
            ConfigManager.save()

            return true
        } else {
            return true
        }
    } catch (error) {
        return Promise.reject(error)
    }
}
// Exports

/**
 * @param {string} username The account username (email if migrated).
 * @param {string} password The account password.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addAccount = async function(username, password){
    try {
        const session = await Mojang.authenticate(username, password, ConfigManager.getClientToken())
        if(session.selectedProfile != null){
            const ret = ConfigManager.addAuthAccount(session.selectedProfile.id, session.accessToken, username, session.selectedProfile.name)
            if(ConfigManager.getClientToken() == null){
                ConfigManager.setClientToken(session.clientToken)
            }
            ConfigManager.save()
            return ret
        } else {
            throw new Error('NotPaidAccount')
        }
        
    } catch (err){
        return Promise.reject(err)
    }
}

/**
 * Remove an account. This will invalidate the access token associated
 * with the account and then remove it from the database.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeAccount = async function(uuid){
    try {
        const authAcc = ConfigManager.getAuthAccount(uuid)
        if(authAcc.type === 'microsoft'){
            ConfigManager.removeAuthAccount(uuid)
            ConfigManager.save()
            return Promise.resolve()
        }
        await Mojang.invalidate(authAcc.accessToken, ConfigManager.getClientToken())
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err){
        return Promise.reject(err)
    }
}

/**
 * Validate the selected account with Mojang's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * **Function is WIP**
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
exports.validateSelected = async function(){
    const current = ConfigManager.getSelectedAccount()
    const isValid = await Mojang.validate(current.accessToken, ConfigManager.getClientToken())
    if(!isValid){
        try{
            if (ConfigManager.getSelectedAccount() === 'microsoft') {
                const validate = await validateSelectedMicrosoft()
                return validate
            } else {
                const validate = await validateSelectedMojang()
                return validate
            }
        } catch (error) {
            return Promise.reject(error)
        }
    } else return true
}

exports.addMSAccount = async authCode => {
    try {
        const accessToken = await Microsoft.getAccessToken(authCode)
        const MCAccessToken = await Microsoft.authMinecraft(accessToken.access_token)
        const minecraftBuyed = await Microsoft.checkMCStore(MCAccessToken.access_token)
        if(!minecraftBuyed)
            return Promise.reject({
                message: '마인크래프트를 구매하지 않으셨습니다.'
            })
        const MCProfile = await Microsoft.getMCProfile(MCAccessToken.access_token)
        const ret = ConfigManager.addMsAuthAccount(MCProfile.id, MCAccessToken.access_token, MCProfile.name, MCAccessToken.expires_at, accessToken.access_token, accessToken.refresh_token)
        ConfigManager.save()

        return ret
    } catch(error) {
        return Promise.reject(error)
    }
}